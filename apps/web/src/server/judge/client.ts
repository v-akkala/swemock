import "server-only";
import fs from "node:fs";
import {
  dsaRunResultSchema,
  projectRunResultSchema,
  runnerHealthSchema,
  type DsaRunRequest,
  type DsaRunResult,
  type ProjectRunRequest,
  type ProjectRunResult,
  type RunnerHealth,
} from "@swemock/shared";
import type { z } from "zod";

/** Thrown when the runner is unreachable or rejects a request; `message` is safe to show users. */
export class JudgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function runnerUrl(): string {
  return process.env.SWEMOCK_RUNNER_URL ?? "http://127.0.0.1:8787";
}

let cachedSecret: string | null = null;

function secret(refresh = false): string {
  if (cachedSecret && !refresh) return cachedSecret;
  const file = process.env.SWEMOCK_RUNNER_SECRET_FILE ?? "/run/swemock/runner-secret";
  try {
    cachedSecret = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim();
  } catch {
    throw new JudgeError("The judge isn't available: its access key is missing. Is the runner service running?", 503);
  }
  return cachedSecret;
}

async function call<S extends z.ZodType>(method: "GET" | "POST", path: string, schema: S, body?: unknown): Promise<z.output<S>> {
  for (const refresh of [false, true]) {
    let res: Response;
    try {
      res = await fetch(runnerUrl() + path, {
        method,
        headers: { authorization: `Bearer ${secret(refresh)}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      throw new JudgeError("The judge isn't reachable. Check that the runner container is running.", 503);
    }
    // The runner regenerates its secret if its volume was recreated; re-read once.
    if (res.status === 401 && !refresh) continue;
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (json as { error?: string }).error ?? `Runner error ${res.status}`;
      throw new JudgeError(message, res.status === 400 ? 400 : 502);
    }
    return schema.parse(json);
  }
  throw new JudgeError("The judge rejected our access key.", 502);
}

export function runnerStatus(): Promise<RunnerHealth> {
  return call("GET", "/v1/status", runnerHealthSchema);
}

export function runDsa(req: DsaRunRequest): Promise<DsaRunResult> {
  return call("POST", "/v1/dsa", dsaRunResultSchema, req);
}

export function runProject(req: ProjectRunRequest): Promise<ProjectRunResult> {
  return call("POST", "/v1/project", projectRunResultSchema, req);
}
