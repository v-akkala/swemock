/**
 * Minimal Docker Engine API client over the unix socket — just what the runner needs.
 * Hand-written to avoid dockerode's dependency tree (ssh2 and native modules).
 */
import http from "node:http";
import type { Duplex } from "node:stream";

const API = "/v1.41";

export class DockerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function socketPathFromEnv(env = process.env): string {
  const host = env.DOCKER_HOST;
  if (host?.startsWith("unix://")) return host.slice("unix://".length);
  return "/var/run/docker.sock";
}

export interface ContainerSpec {
  Image: string;
  Cmd?: string[];
  User?: string;
  WorkingDir?: string;
  Env?: string[];
  Labels?: Record<string, string>;
  AttachStdin?: boolean;
  AttachStdout?: boolean;
  AttachStderr?: boolean;
  OpenStdin?: boolean;
  StdinOnce?: boolean;
  Tty?: boolean;
  NetworkDisabled?: boolean;
  HostConfig: Record<string, unknown>;
}

export class Docker {
  constructor(readonly socketPath: string) {}

  private request(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 30_000,
  ): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        {
          socketPath: this.socketPath,
          method,
          path: API + path,
          headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
          res.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error(`Docker API timeout: ${method} ${path}`)));
      req.on("error", reject);
      req.end(payload);
    });
  }

  private async json<T>(method: string, path: string, body?: unknown, okStatuses = [200, 201, 204]): Promise<T> {
    const { status, text } = await this.request(method, path, body);
    if (!okStatuses.includes(status)) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* not JSON */
      }
      throw new DockerError(`${method} ${path}: ${status} ${message}`, status);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async ping(): Promise<boolean> {
    try {
      const { status } = await this.request("GET", "/_ping", undefined, 3000);
      return status === 200;
    } catch {
      return false;
    }
  }

  async imageExists(ref: string): Promise<boolean> {
    const { status } = await this.request("GET", `/images/${encodeURIComponent(ref)}/json`);
    return status === 200;
  }

  async createContainer(spec: ContainerSpec): Promise<string> {
    const res = await this.json<{ Id: string }>("POST", "/containers/create", spec);
    return res.Id;
  }

  /**
   * Attaches to a created (not yet started) container's stdio. Returns the hijacked socket:
   * write stdin to it, end() it to close stdin, and read the multiplexed stdout/stderr stream.
   */
  attach(id: string): Promise<Duplex> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        socketPath: this.socketPath,
        method: "POST",
        path: `${API}/containers/${id}/attach?stream=1&stdin=1&stdout=1&stderr=1`,
        headers: { Connection: "Upgrade", Upgrade: "tcp" },
      });
      req.on("upgrade", (_res, socket, head) => {
        if (head.length) socket.unshift(head);
        resolve(socket);
      });
      req.on("response", (res) => reject(new DockerError(`attach failed: ${res.statusCode}`, res.statusCode ?? 0)));
      req.on("error", reject);
      req.end();
    });
  }

  async start(id: string): Promise<void> {
    await this.json("POST", `/containers/${id}/start`, undefined, [204, 304]);
  }

  async kill(id: string): Promise<void> {
    await this.json("POST", `/containers/${id}/kill`, undefined, [204, 404, 409]);
  }

  async remove(id: string): Promise<void> {
    await this.json("DELETE", `/containers/${id}?force=1&v=1`, undefined, [204, 404, 409]);
  }

  async inspect(id: string): Promise<{ State: { OOMKilled: boolean; ExitCode: number; Running: boolean } }> {
    return this.json("GET", `/containers/${id}/json`);
  }

  async listByLabel(label: string): Promise<string[]> {
    const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
    const list = await this.json<{ Id: string }[]>("GET", `/containers/json?all=1&filters=${filters}`);
    return list.map((c) => c.Id);
  }
}

/**
 * Splits Docker's multiplexed attach stream (non-TTY) into stdout and stderr.
 * Frame: [stream(1) 0 0 0 size(4, big-endian)] + payload. Stops collecting past `cap` bytes per stream.
 */
export class StreamDemuxer {
  private buf: Buffer = Buffer.alloc(0);
  readonly stdout: Buffer[] = [];
  readonly stderr: Buffer[] = [];
  stdoutBytes = 0;
  stderrBytes = 0;
  overflow = false;

  constructor(private readonly cap: number) {}

  push(chunk: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 8) {
      const size = this.buf.readUInt32BE(4);
      if (this.buf.length < 8 + size) break;
      const kind = this.buf[0];
      const payload = this.buf.subarray(8, 8 + size);
      this.buf = this.buf.subarray(8 + size);
      if (kind === 1) this.collect(payload, this.stdout, "stdoutBytes");
      else if (kind === 2) this.collect(payload, this.stderr, "stderrBytes");
    }
  }

  private collect(payload: Buffer, into: Buffer[], counter: "stdoutBytes" | "stderrBytes"): void {
    const room = this.cap - this[counter];
    if (room <= 0) {
      this.overflow = true;
      return;
    }
    const part = payload.length > room ? payload.subarray(0, room) : payload;
    if (part.length < payload.length) this.overflow = true;
    into.push(part);
    this[counter] += part.length;
  }

  text(stream: "stdout" | "stderr"): string {
    return Buffer.concat(this[stream]).toString("utf8");
  }
}
