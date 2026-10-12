# Decisions

One line each: decision — rationale.

## M0
- pnpm 12.11.2, Node 24 LTS in images (Node ≥ 24 locally) — current pnpm; Node 24 is the active LTS.
- TypeScript 6.0.3, not 7.x — typescript-eslint 8 supports only TS < 6.1.
- ESLint 9.39 — eslint-config-next 16's plugins target ESLint 9.
- No `services/runner` package until M1 — the spec forbids placeholder stubs; the runner ships with real code in M1.
- No shadcn CLI-generated deps yet; hand-written shadcn-style primitives — avoids pulling Radix etc. until a component needs them.
- Database: one SQLite file `/data/swemock.db`, WAL mode, `VACUUM INTO` backup on every start, keep the last 10 — consistent copy even with WAL; restarts are rare.
- Migrations run from `instrumentation.ts` at boot (and lazily on first `getDb()`) — the app never serves requests against an unmigrated DB.
- Settings stored as one validated JSON row — few keys, always read together; `normalizeSettings` makes old rows forward-compatible.
- Theme stored in settings and rendered server-side on `<html>` — no flash of the wrong theme; dark by default.
- API guard (`proxy.ts`): loopback Host only (override `SWEMOCK_ALLOWED_HOSTS`), same-origin + JSON for writes — 127.0.0.1 binding alone doesn't stop DNS rebinding or CSRF from other sites in the browser.
- `compose.yaml` builds locally with `pull_policy: build` until v1.0.0 — the GHCR images don't exist yet; M10 switches to pinned pulls.
- GHCR image names use owner `v-akkala` — taken from the git remote.
- `compose.dev.yml` uses a separate `swemock-dev-data` volume and polling watchers — dev must never touch real data; polling is reliable across Docker Desktop file sharing.
- Unbuilt sections show a "planned for Mx" page via `app/(rounds)/[round]` — navigation stays complete; each section replaces it with a real route when its milestone lands.
- Providers other than `none` are visible but disabled in Settings until M3.
