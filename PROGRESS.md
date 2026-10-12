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

- **M1 — Judge** (Python and C++)
  - Sandbox images `images/sandbox-python` (3.12 + pytest) and `images/sandbox-cpp` (g++ 14 C++20 + doctest + precompiled runtime header), with a shared in-container agent `images/common/agent.py`.
  - DSA harness: language-neutral signatures (`packages/shared/src/judge`), generic Python driver, generated C++ driver; ints/longs/doubles/bools/chars/strings, arrays and lists (nested), ListNode, TreeNode, design-class problems; checkers exact/unordered/float/custom; verdicts AC/WA/TLE/MLE/RE/CE plus "ran" (custom input) and "skipped"; per-test time, memory, stdout/stderr.
  - Project runs: shell command or "run current file", JUnit XML/JSON parsing, category regexes.
  - `services/runner`: auth, Zod validation, image allowlist, locked-down containers, concurrency limit, leftover cleanup, status endpoint.
  - Compose: sandbox self-test services, runner (only service with the socket, internal network), web waits for runner health. Dev compose reuses them.
  - Web: runner client, `/api/runner/status`, header judge indicator, Settings → Judge section, `/playground` (sample problem + run a program).
  - Tests: shared 12, runner unit 12, web 8, sandbox 38 (incl. containment: infinite loop, fork bombs, memory hog, network, writes outside /work, privileges, /proc of agent).
  - SECURITY.md written; DECISIONS.md M1 section.
  - Scope change mid-M1: Python and C++ only. Java and Node/TypeScript work that had been started (sandbox images `images/sandbox-java` and `images/sandbox-node`, a Java JSON/driver runtime, a TypeScript driver and transpiler, Java/TS stub and driver codegen) was removed before being committed; spec/PLAN/DECISIONS updated.

## In progress
- Nothing. Waiting for the user to test M1.

## Next: M2 — DSA practice (no AI)
1. DSA content schema (`problem.yaml`) in `packages/shared`, `content/dsa/<slug>/` layout (PLAN.md §3), `pnpm content:new`, `content:gen` (seeded generator → hidden tests via the reference in the sandbox), `content:validate [item|--all]` (Python + C++ references pass, brute TLEs when `tle_guard`, ≥15 hidden tests, reproducible generation).
2. Content sync into SQLite (hash-based, at startup and on change) with the public/private split; `./content` bind-mounted read-only into web.
3. 15 problems across difficulties/topics, in batches with validation.
4. Problem browser (filters, constrained random), Monaco (bundled locally) editor with per-language drafts, custom input, Run/Submit, verdict panel with hidden-test masking, efficiency indicator vs reference.
5. Hint ladder, editorial after submit/give-up, OA mode, spaced repetition, keyboard shortcuts.
6. Playwright e2e for the DSA flow.

## Known issues
- None.

## Cut scope
- Java and Node/TypeScript languages (user decision during M1); the runner remains pluggable.
- Warm container pool (optional per spec) — not needed: Python runs take ~0.2s and C++ ~0.6s including compile.
