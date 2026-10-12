import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../services/runner/src/config";
import { Docker } from "../../services/runner/src/docker";
import { Judge } from "../../services/runner/src/judge";

function dockerSocket(): string {
  const host = process.env.DOCKER_HOST;
  if (host?.startsWith("unix://")) return host.slice("unix://".length);
  for (const candidate of ["/var/run/docker.sock", path.join(os.homedir(), ".docker/run/docker.sock")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "/var/run/docker.sock";
}

/**
 * The content tools run references and generators in the same sandbox as the app, by using the
 * runner's Judge in-process. Needs Docker and the sandbox images: `docker compose build sandbox-python sandbox-cpp`.
 */
export async function createJudge(): Promise<Judge> {
  const config = { ...loadConfig(), socketPath: dockerSocket(), maxConcurrent: 4, maxQueued: 200 };
  const judge = new Judge(new Docker(config.socketPath), config);
  const status = await judge.status();
  if (!status.ok) {
    throw new Error(
      `${status.error ?? "The judge isn't ready."}\nStart Docker and run: docker compose build sandbox-python sandbox-cpp`,
    );
  }
  return judge;
}
