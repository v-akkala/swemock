import { loadConfig } from "./config";
import { Docker } from "./docker";
import { Judge } from "./judge";
import { loadOrCreateSecret } from "./secret";
import { createServer } from "./server";

const config = loadConfig();
const secret = loadOrCreateSecret(config.secretFile);
const docker = new Docker(config.socketPath);
const judge = new Judge(docker, config);

const removed = await judge.cleanup().catch((e: unknown) => {
  console.error("[runner] cleanup failed:", e instanceof Error ? e.message : e);
  return 0;
});
if (removed) console.log(`[runner] removed ${removed} leftover sandbox container(s)`);

const status = await judge.status();
console.log(`[runner] docker=${status.docker} languages=${JSON.stringify(status.languages)}${status.error ? ` error="${status.error}"` : ""}`);

const server = createServer(judge, secret);
server.listen(config.port, config.host, () => console.log(`[runner] listening on ${config.host}:${config.port}`));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close();
    judge.cleanup().finally(() => process.exit(0));
  });
}
