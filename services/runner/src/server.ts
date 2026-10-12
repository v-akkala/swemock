import http from "node:http";
import type { Judge } from "./judge";
import { BadRequestError } from "./judge";
import { secretMatches } from "./secret";
import { QueueFullError } from "./semaphore";
import { SandboxError } from "./sandbox";
import { LIMITS } from "@swemock/shared";

const MAX_BODY = LIMITS.maxBundleBytes + 1024 * 1024;

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new BadRequestError("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new BadRequestError("Body must be JSON."));
      }
    });
    req.on("error", reject);
  });
}

export function createServer(judge: Judge, secret: string): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://runner");
    try {
      // Unauthenticated liveness probe for the container healthcheck; reveals nothing.
      if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true });

      if (!secretMatches(req.headers.authorization, secret)) return send(res, 401, { error: "Unauthorized" });

      if (req.method === "GET" && url.pathname === "/v1/status") return send(res, 200, await judge.status());
      if (req.method === "POST" && url.pathname === "/v1/dsa") return send(res, 200, await judge.runDsa(await readBody(req)));
      if (req.method === "POST" && url.pathname === "/v1/project") {
        return send(res, 200, await judge.runProject(await readBody(req)));
      }
      return send(res, 404, { error: "Not found" });
    } catch (e) {
      if (e instanceof BadRequestError) return send(res, 400, { error: e.message, issues: e.issues });
      if (e instanceof QueueFullError) return send(res, 429, { error: e.message });
      if (e instanceof SandboxError) return send(res, 502, { error: e.message });
      console.error("[runner]", e);
      return send(res, 500, { error: e instanceof Error ? e.message : "Internal error" });
    }
  });
}
