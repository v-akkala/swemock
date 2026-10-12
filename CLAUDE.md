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
- `pnpm e2e` — Playwright against a live stack started with `SWEMOCK_TEST_MODE=1 docker compose up -d --build` (fake AI provider + `/api/test/reset`, which each spec calls first: **it wipes the app's user data**, so never point e2e at a stack you use). Override the URL with `SWEMOCK_URL`. First time: `pnpm --filter @swemock/web exec playwright install chromium`.
- `pnpm content:validate --all` — every shipped problem against the sandbox.
- CI (`.github/workflows/ci.yml`): checks, sandbox tests + content validation, and compose up + e2e.
- Manual: Settings → Judge → playground (`/playground`).

## Add content
`pnpm content:new dsa <slug>` → edit → `pnpm content:gen <slug>` → `pnpm content:validate <slug>` (needs Docker + sandbox images). A running app picks the new folder up within seconds (`./content` is mounted into web). Guide: `docs/adding-problems.md`; AI drafting brief: `prompts/authoring/dsa.md`. `pnpm content:validate --all` is the CI gate.

## Architecture (current)
- AI layer (`apps/web/src/server/ai/`): `config.ts` resolves Settings + env overrides into a provider (`anthropic` via the official SDK with prompt caching and server-side refusal fallbacks; `ollama`/`openai-compatible` via fetch; `fake` in test mode). `run.ts` (`streamText`, `completeText`, `completeJson` with one repair retry) records token usage and enforces the per-session cap. `leak-filter.ts` guards interviewer and approach-check output. Keys: `server/crypto/secrets.ts`.
- Interviews (`server/interview/`): `engine.ts` is the round state machine (phases + deadline in `sessions.state_json`, settled on every read) and the scripted driver; `llm.ts` streams the AI interviewer through the leak filter with a look-behind window and records `<<nudge>>`s as hints. Chat lives in `events` (kind `chat`). Run/submit/hints reuse `server/dsa/service.ts` with the interview session id.
- Prompts: `prompts/interviewer/*`, `prompts/packets/*` (front matter `id`/`version`), loaded by `server/prompts/templates.ts`; `{{var}}` must all be supplied. `/prompts` in Docker.
- Packets, grading, approach check: `server/packets.ts`. Scorecards: `server/scoring/scorecard.ts` (auto from events, self/ai stored). Rubrics and formulas: `@swemock/shared/scoring` (server-only import path so the rubric never ships to the browser). Debrief/replay data: `server/debrief.ts`.
- Languages: **Python and C++ only**, but pluggable. Adding one = `LANGUAGES` (`packages/shared/src/judge/protocol.ts`) + codegen module (`judge/codegen/`) + runner profile (`services/runner/src/languages/`) + sandbox image (`images/sandbox-<lang>/`) + compose sandbox service.
- `services/runner` — judge service; the only container with the Docker socket. `/healthz` (unauthenticated), `/v1/status`, `/v1/dsa`, `/v1/project` (Bearer secret from `/run/swemock/runner-secret`). Builds a JSON bundle per run (`bundles.ts`) and runs it in a locked-down sibling container (`sandbox.ts`, limits listed in SECURITY.md).
- `images/` — sandbox images. `common/agent.py` is every image's entrypoint: reads the bundle from stdin, compiles, feeds tests to the driver (stdin lines in, fd-3 lines out), enforces time/memory/output, runs checkers, prints one JSON result. Python driver: `sandbox-python/driver.py` (generic). C++: generated `main.cpp` + precompiled `sandbox-cpp/swemock.hpp`.
- `packages/shared/src/judge/` — signature type grammar, Zod protocol schemas shared by web and runner, codegen (stubs + C++ driver).
- Web → runner: `apps/web/src/server/judge/client.ts`.
- `apps/web` — Next.js 16 App Router, standalone output. Server code in `src/server/` (imports `server-only`).
  - `server/db/open.ts`: open SQLite → back up (`VACUUM INTO /data/backups`, keep 10) → Drizzle migrate → ensure default user. `instrumentation.ts` runs this at boot.
  - `server/settings.ts`: settings are one JSON row (`settings.key = "app"`), normalized through `@swemock/shared` `normalizeSettings`.
  - `src/proxy.ts` + `server/http/request-guard.ts`: every `/api/*` request must have a loopback Host (anti DNS-rebinding); writes must be same-origin JSON (anti CSRF).
- `packages/shared` — Zod schemas, types, codegen, value validators, spaced-repetition math, shared by web, runner, and content tooling.
- `packages/content` — `problem.yaml` schema, folder loader, public/private split, hashing. Used by the web sync and by `scripts/`.
- `scripts/` — `content.ts` (`new | gen | validate`); runs the runner's `Judge` in-process against local Docker. `templates/dsa` is the scaffold (a tiny valid example).
- Content flow: `content/dsa/<slug>/` → `loadContentDir` → `toStored` splits into `public_json` (browser-safe: statement, signature, samples) and `private_json` (hints, editorial, hidden tests, checker, references) → `content_items`. `server/content/sync.ts` re-syncs when the tree's fingerprint changes (checked at most every 2s, from `listDsa`/`getDsa`); items missing from disk are soft-deleted; a changed item's `reviewed` resets to the manifest value.
- DSA runtime (`apps/web/src/server/dsa/`): `service.ts` (run/submit/hints/editorial/give up, page data), `mask.ts` (the only path from judge results to the browser: hidden tests keep only label, category, verdict, time), `store.ts` (sessions, events, drafts, submissions), `srs.ts`, `oa.ts`. Routes under `app/api/dsa/`.
- Hidden content rule: private content is read only inside `service.ts`; nothing from `getDsaPrivate` is returned unless a function reveals it deliberately (hint by level, editorial after the ladder/solve/give up). `e2e/dsa.spec.ts` scans every response body for hidden inputs, hints, editorial and reference code.
- UI: route groups `(site)` (centered pages) and `(workspace)` (full-window code pages). Workspace = `components/dsa/workspace.tsx` (Monaco via `code-editor-lazy`, SplitPane, VerdictPanel). The editor test hook is `window.__swemockSetCode`.

## Conventions
- Exact dependency versions (`.npmrc save-exact`). Keep the dependency count low.
- IDs are ULIDs, timestamps epoch ms, JSON columns end in `_json` and are Zod-validated at the edges.
- Schema change: edit `apps/web/src/server/db/schema.ts`, then `pnpm db:generate --name <change>`; commit the migration. Never edit an existing migration.
- New native/postinstall deps must be allowed in `pnpm-workspace.yaml` `allowBuilds`.
- UI components are hand-written shadcn-style in `components/ui/` (Tailwind v4, CSS variables in `globals.css`).

## Gotchas
- Import rubrics/formulas from `@swemock/shared/scoring`, never the main `@swemock/shared` index from client code (the e2e leak scan checks JS bundles too).
- Events in the same millisecond have no defined order (ULIDs aren't monotonic within a ms); offset follow-up events by 1 ms when order matters.
- Current Claude models reject `temperature`; the Anthropic provider never sends it.
- Monaco 0.57 has no `editor.all`; `code-editor.tsx` imports `editor/editor.api`, `features/register.all` and the python/cpp definitions only (types shimmed in `src/types/monaco.d.ts`). Workers are bundled with `new Worker(new URL(...))`; nothing loads from a CDN.
- The React compiler lint rules reject writing refs during render, `Date.now()` in server components, and setState in effects; update refs in an effect, compute time in non-component functions (`getOa` returns `now`).
- A helper named `useXxx` is treated as a hook by the linter, even in tests (hence `freshTempDatabase`).
- Server tests (`*.test.ts` in apps/web) use `server/test-utils.ts` to point `getDb()` and the content dir at temp locations; they mock `server/judge/client` rather than calling Docker.
- `next dev` writes an `AGENTS.md`; disabled with `agentRules: false` in `next.config.ts`.
- Changing `images/**` or the C++ compile flags: the flags in `services/runner/src/languages/cpp.ts` must match the PCH build in `images/sandbox-cpp/Dockerfile`, then rebuild images.
- Agent protocol changes touch three places: `agent.py`, the drivers, and `agentDsaSchema` in `services/runner/src/judge.ts`.
- Docker Desktop's kernel shows down tunnel interfaces (tunl0, gre0, …) in every network namespace; "no network" is asserted via an empty route table.
- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TS 7 yet. ESLint is pinned to 9 for eslint-config-next.
- Next 16: middleware is `src/proxy.ts`; route `params` are Promises.
- `server/config.ts` uses `/*turbopackIgnore: true*/` on runtime paths; without it the file tracer copies the whole repo into the build.
- pnpm 12 enforces a minimum release age; brand-new versions end up in `minimumReleaseAgeExclude`.
