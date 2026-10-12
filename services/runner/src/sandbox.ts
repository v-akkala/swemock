import type { Docker, ContainerSpec } from "./docker";
import { StreamDemuxer } from "./docker";
import type { Bundle } from "./bundles";

export const SANDBOX_LABEL = "swemock.sandbox";
/** Container memory above the user's limit: compilers, the agent, and an OOM backstop. */
export const MEMORY_HEADROOM_MB = 384;
const AGENT_OUTPUT_CAP = 32 * 1024 * 1024;

export class SandboxError extends Error {}

/** Container settings for every run. The only inputs are the allowlisted image and the memory limit. */
export function containerSpec(image: string, memoryLimitMb: number): ContainerSpec {
  const memory = (memoryLimitMb + MEMORY_HEADROOM_MB) * 1024 * 1024;
  return {
    Image: image,
    User: "65534:65534",
    WorkingDir: "/work",
    Env: ["HOME=/tmp"],
    Labels: { [SANDBOX_LABEL]: "1" },
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: true,
    Tty: false,
    NetworkDisabled: true,
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Tmpfs: {
        "/tmp": "rw,noexec,nosuid,nodev,size=64m,mode=1777",
        "/work": "rw,exec,nosuid,nodev,size=128m,mode=1777",
      },
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      Memory: memory,
      MemorySwap: memory,
      NanoCpus: 1_000_000_000,
      PidsLimit: 64,
      Ulimits: [{ Name: "nofile", Soft: 1024, Hard: 1024 }],
      LogConfig: { Type: "none", Config: {} },
      Privileged: false,
      Binds: [],
      AutoRemove: false,
    },
  };
}

export interface SandboxOutcome {
  /** Parsed `result` from the agent. */
  result: unknown;
  durationMs: number;
}

/** Runs one bundle in a fresh container and removes the container afterwards. */
export async function runInSandbox(docker: Docker, image: string, bundle: Bundle): Promise<SandboxOutcome> {
  const started = Date.now();
  const id = await docker.createContainer(containerSpec(image, bundle.memoryLimitMb));
  let timedOut = false;
  try {
    const socket = await docker.attach(id);
    const demux = new StreamDemuxer(AGENT_OUTPUT_CAP);
    const done = new Promise<void>((resolve, reject) => {
      socket.on("data", (c: Buffer) => demux.push(c));
      socket.on("end", resolve);
      socket.on("close", resolve);
      socket.on("error", reject);
    });
    await docker.start(id);
    socket.end(JSON.stringify(bundle.payload));

    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        docker.kill(id).finally(resolve);
      }, bundle.deadlineMs);
    });
    await Promise.race([done, deadline]);
    clearTimeout(timer);

    if (timedOut) throw new SandboxError(`Sandbox exceeded its ${Math.round(bundle.deadlineMs / 1000)}s deadline and was killed.`);
    if (demux.overflow) throw new SandboxError("Sandbox produced too much output.");

    const lines = demux.text("stdout").trim().split("\n");
    const last = lines[lines.length - 1] ?? "";
    let parsed: { ok: boolean; result?: unknown; error?: string };
    try {
      parsed = JSON.parse(last);
    } catch {
      const state = await docker.inspect(id).catch(() => null);
      const why = state?.State.OOMKilled ? " (the sandbox ran out of memory)" : "";
      throw new SandboxError(`Sandbox agent returned no result${why}. ${demux.text("stderr").slice(0, 2000)}`);
    }
    if (!parsed.ok) throw new SandboxError(`Sandbox agent error: ${parsed.error}`);
    return { result: parsed.result, durationMs: Date.now() - started };
  } finally {
    await docker.remove(id).catch(() => undefined);
  }
}
