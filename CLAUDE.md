# swemock — working notes

Spec: `spec.md` (source of truth). Plan: `PLAN.md`. Status: `PROGRESS.md`. Choices: `DECISIONS.md`.
**Workflow:** build one milestone, run all checks, update PROGRESS.md, commit + push, then stop so the user can test.

## Run
- Prod-like: `docker compose up -d` → http://localhost:3000 (port: `SWEMOCK_PORT`). Data lives in volume `swemock-data`.
- Dev in Docker (hot reload, separate `swemock-dev-data` volume): `docker compose -f compose.dev.yml up`.
- Dev on host: `pnpm install && pnpm dev` (data in `apps/web/.data/`). Needs Node ≥ 24 and pnpm 12 (`npm i -g pnpm@12.11.2`).

## Test
`pnpm typecheck && pnpm lint && pnpm test && pnpm build`. CI (`.github/workflows/ci.yml`) also builds and health-checks the compose stack.

## Add content
Not yet available (arrives in M2: `pnpm content:new`, `content:gen`, `content:validate`).

## Architecture (current)
- `apps/web` — Next.js 16 App Router, standalone output. Server code in `src/server/` (imports `server-only`).
  - `server/db/open.ts`: open SQLite → back up (`VACUUM INTO /data/backups`, keep 10) → Drizzle migrate → ensure default user. `instrumentation.ts` runs this at boot.
  - `server/settings.ts`: settings are one JSON row (`settings.key = "app"`), normalized through `@swemock/shared` `normalizeSettings`.
  - `src/proxy.ts` + `server/http/request-guard.ts`: every `/api/*` request must have a loopback Host (anti DNS-rebinding); writes must be same-origin JSON (anti CSRF).
- `packages/shared` — Zod schemas and types shared by server and client.

## Conventions
- Exact dependency versions (`.npmrc save-exact`). Keep the dependency count low.
- IDs are ULIDs, timestamps epoch ms, JSON columns end in `_json` and are Zod-validated at the edges.
- Schema change: edit `apps/web/src/server/db/schema.ts`, then `pnpm db:generate --name <change>`; commit the migration. Never edit an existing migration.
- New native/postinstall deps must be allowed in `pnpm-workspace.yaml` `allowBuilds`.
- UI components are hand-written shadcn-style in `components/ui/` (Tailwind v4, CSS variables in `globals.css`).

## Gotchas
- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support TS 7 yet. ESLint is pinned to 9 for eslint-config-next.
- Next 16: middleware is `src/proxy.ts`; route `params` are Promises.
- `server/config.ts` uses `/*turbopackIgnore: true*/` on runtime paths; without it the file tracer copies the whole repo into the build.
- pnpm 12 enforces a minimum release age; brand-new versions end up in `minimumReleaseAgeExclude`.
