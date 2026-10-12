# swemock — working notes

Spec: `spec.md` (source of truth). Plan: `PLAN.md`. Status: `PROGRESS.md`. Choices: `DECISIONS.md`.
**Workflow:** build one milestone, run all checks, update PROGRESS.md, commit + push, then stop so the user can test.

## Run
- Prod-like: `docker compose up -d` → http://localhost:3000 (port: `SWEMOCK_PORT`). Data lives in volume `swemock-data`. Rebuild after changes: `docker compose up -d --build`.
- Dev in Docker (web hot reload, separate `swemock-dev-data` volume): `docker compose -f compose.dev.yml up`.
- Dev on host: `pnpm install && pnpm dev` (data in `apps/web/.data/`). Needs Node ≥ 24 and pnpm 12 (`npm i -g pnpm@12.11.2`). For the judge, also run the runner on the host:
  `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock SWEMOCK_RUNNER_SECRET_FILE=apps/web/.data/runner-secret pnpm --filter @swemock/runner dev`
  and start web with `SWEMOCK_RUNNER_SECRET_FILE=.data/runner-secret` (relative to apps/web). Sandbox images come from `docker compose build sandbox-python sandbox-cpp`.

## Test
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- `pnpm test:sandbox` — real containers: DSA verdicts, project runs, containment. Needs the sandbox images (`docker compose build sandbox-python sandbox-cpp`); on macOS set `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock`. To test images built under other names, set `SWEMOCK_IMAGE_PREFIX` / `SWEMOCK_SANDBOX_TAG`.
- CI (`.github/workflows/ci.yml`): checks, sandbox tests, and compose up + a judged submission through the app.
- Manual: Settings → Judge → playground (`/playground`).

## Add content
Not yet available (arrives in M2: `pnpm content:new`, `content:gen`, `content:validate`).

## Architecture (current)
- Languages: **Python and C++ only**, but pluggable. Adding one = `LANGUAGES` (`packages/shared/src/judge/protocol.ts`) + codegen module (`judge/codegen/`) + runner profile (`services/runner/src/languages/`) + sandbox image (`images/sandbox-<lang>/`) + compose sandbox service.
- `services/runner` — judge service; the only container with the Docker socket. `/healthz` (unauthenticated), `/v1/status`, `/v1/dsa`, `/v1/project` (Bearer secret from `/run/swemock/runner-secret`). Builds a JSON bundle per run (`bundles.ts`) and runs it in a locked-down sibling container (`sandbox.ts`, limits listed in SECURITY.md).
- `images/` — sandbox images. `common/agent.py` is every image's entrypoint: reads the bundle from stdin, compiles, feeds tests to the driver (stdin lines in, fd-3 lines out), enforces time/memory/output, runs checkers, prints one JSON result. Python driver: `sandbox-python/driver.py` (generic). C++: generated `main.cpp` + precompiled `sandbox-cpp/swemock.hpp`.
- `packages/shared/src/judge/` — signature type grammar, Zod protocol schemas shared by web and runner, codegen (stubs + C++ driver).
- Web → runner: `apps/web/src/server/judge/client.ts`.
- `apps/web` — Next.js 16 App Router, standalone output. Server code in `src/server/` (imports `server-only`).
  - `server/db/open.ts`: open SQLite → back up (`VACUUM INTO /data/backups`, keep 10) → Drizzle migrate → ensure default user. `instrumentation.ts` runs this at boot.
  - `server/settings.ts`: settings are one JSON row (`settings.key = "app"`), normalized through `@swemock/shared` `normalizeSettings`.
  - `src/proxy.ts` + `server/http/request-guard.ts`: every `/api/*` request must have a loopback Host (anti DNS-rebinding); writes must be same-origin JSON (anti CSRF).
- `packages/shared` — Zod schemas, types, codegen shared by web, runner, and (from M2) content tooling.

## Conventions
- Exact dependency versions (`.npmrc save-exact`). Keep the dependency count low.
- IDs are ULIDs, timestamps epoch ms, JSON columns end in `_json` and are Zod-validated at the edges.
- Schema change: edit `apps/web/src/server/db/schema.ts`, then `pnpm db:generate --name <change>`; commit the migration. Never edit an existing migration.
- New native/postinstall deps must be allowed in `pnpm-workspace.yaml` `allowBuilds`.
- UI components are hand-written shadcn-style in `components/ui/` (Tailwind v4, CSS variables in `globals.css`).

## Gotchas
- Changing `images/**` or the C++ compile flags: the flags in `services/runner/src/languages/cpp.ts` must match the PCH build in `images/sandbox-cpp/Dockerfile`, then rebuild images.
- Agent protocol changes touch three places: `agent.py`, the drivers, and `agentDsaSchema` in `services/runner/src/judge.ts`.
- Docker Desktop's kernel shows down tunnel interfaces (tunl0, gre0, …) in every network namespace; "no network" is asserted via an empty route table.
- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TS 7 yet. ESLint is pinned to 9 for eslint-config-next.
- Next 16: middleware is `src/proxy.ts`; route `params` are Promises.
- `server/config.ts` uses `/*turbopackIgnore: true*/` on runtime paths; without it the file tracer copies the whole repo into the build.
- pnpm 12 enforces a minimum release age; brand-new versions end up in `minimumReleaseAgeExclude`.
