# Progress

## Done
- **Planning:** PLAN.md written. spec.md updated with the reduced v1.0 content targets (§6.3) and the "adding problems must be easy" requirement (§6.4).
- **M0 — Scaffold and distribution skeleton**
  - pnpm workspace: `apps/web` (Next.js 16), `packages/shared` (Zod settings schema).
  - SQLite + Drizzle with the full PLAN.md §2 schema; migration `apps/web/drizzle/0000_init.sql`; startup backup (keep 10) + migrate + default user.
  - App shell: nav, home cards, "planned for Mx" pages, dark/light toggle (persisted), Settings page (provider `none`, data dir + backup info).
  - `/api/health`, `/api/settings` (GET/PATCH, Zod-validated), API request guard against DNS rebinding and CSRF.
  - `compose.yaml` (local build, 127.0.0.1 binding, `swemock-data` volume, healthcheck) and `compose.dev.yml` (hot reload, separate volume).
  - CI: typecheck, lint, unit tests, build, compose up + health check.
  - CLAUDE.md, DECISIONS.md, .gitignore, .gitattributes, .env.example, LICENSE.
  - Verified: unit tests (11), lint, typecheck, build; `docker compose up -d` healthy; settings persist across `docker compose restart`; backup created on restart; port not reachable from the LAN IP; dev compose hot-reloads.

## In progress
- Nothing. Waiting for the user to test M0.

## Next: M1 — Judge
1. Add `services/*` back to `pnpm-workspace.yaml`; create `services/runner`.
2. `images/common/agent.py`, sandbox images for Python + C++, then Java + Node.
3. Signature codegen in `packages/shared/src/codegen/` (stubs and drivers for 4 languages) + checkers.
4. Runner: HMAC auth, Zod validation, image allowlist, container limits, `/v1/dsa`, `/v1/project`, `/healthz`, image pull.
5. Add the runner to both compose files (socket only in the runner; shared secret volume); web waits for runner health; runner health shown in UI.
6. Containment tests: infinite loop, fork bomb, memory hog, network attempt, write outside /work.
7. Write SECURITY.md (sandbox design + threat model), DECISIONS.md entry for Option A.

## Known issues
- None.

## Cut scope
- None yet.
