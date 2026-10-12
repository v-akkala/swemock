import { socketPathFromEnv } from "./docker";

export interface RunnerConfig {
  port: number;
  host: string;
  secretFile: string;
  /** `${imagePrefix}${profile.image}:${imageTag}` — set by compose, never by requests. */
  imagePrefix: string;
  imageTag: string;
  socketPath: string;
  maxConcurrent: number;
  maxQueued: number;
  version: string;
}

export function loadConfig(env = process.env): RunnerConfig {
  return {
    port: Number(env.SWEMOCK_RUNNER_PORT ?? 8787),
    host: env.SWEMOCK_RUNNER_HOST ?? "0.0.0.0",
    secretFile: env.SWEMOCK_RUNNER_SECRET_FILE ?? "/run/swemock/runner-secret",
    imagePrefix: env.SWEMOCK_IMAGE_PREFIX ?? "ghcr.io/v-akkala/swemock-",
    imageTag: env.SWEMOCK_SANDBOX_TAG ?? "0.1.0",
    socketPath: socketPathFromEnv(env),
    maxConcurrent: Number(env.SWEMOCK_RUNNER_CONCURRENCY ?? 2),
    maxQueued: 20,
    version: env.SWEMOCK_VERSION ?? "0.1.0",
  };
}
