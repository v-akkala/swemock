import type { DsaRunRequest, ProjectRunRequest, Signature } from "@swemock/shared";
import { loadConfig } from "../../src/config";
import { Docker } from "../../src/docker";
import { Judge } from "../../src/judge";

/**
 * Sandbox tests talk to the real Docker daemon and need the sandbox images built
 * (`docker compose build`). Image names follow the same env vars as the runner.
 */
const config = loadConfig();
export const docker = new Docker(config.socketPath);
export const judge = new Judge(docker, config);

export function dsa(req: DsaRunRequest) {
  return judge.runDsa(req);
}

export function project(req: ProjectRunRequest) {
  return judge.runProject(req);
}

export const addSig: Signature = {
  kind: "function",
  name: "add",
  params: [
    { name: "a", type: "int" },
    { name: "b", type: "int" },
  ],
  returns: "int",
};
