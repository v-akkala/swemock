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

- **M2 — DSA practice (no AI)**
  - **Content system:** `packages/content` (problem.yaml schema, loader, public/private split, hashing); `scripts/` with `pnpm content:new | gen | validate` (scaffold is a tiny working example; validation covers schema, tests vs signature, both references over all tests, brute-force TLE guard, generator reproducibility, stub compilation, statement/editorial sections). Judge additions: `captureFull`, `collect`.
  - **15 problems** (4 easy / 8 medium / 3 hard) in `content/dsa/`, all with Python + C++ references, seeded generators (15–30 hidden tests each), hints, editorials, follow-ups; includes a custom checker (`course-order`) and two design-class problems. Committed in three validated batches.
  - **App:** content sync into SQLite (live pickup, soft delete, review reset), problem browser (tag/difficulty/status/company/search filters, constrained random picker, progress), problem workspace (statement with KaTeX | Monaco editor | console; Python/C++ with per-language drafts autosaved every 5 s; Run on samples + custom input; Submit on all tests; verdict panel with masked hidden tests and an efficiency indicator), hint ladder (4 hints → editorial + reference solutions; give up), spaced repetition (1/3/7/14 days, due list on `/dsa`), OA mode (2 problems, 70/80/90 min, server-side deadline, partial credit, results), `/content-review`, Cmd/Ctrl+K palette, keyboard shortcuts (Cmd/Ctrl+Enter run, +Shift submit), sessions/events/submissions logged.
  - **Tests:** shared 21, content 6, scripts 2, runner unit 12 + sandbox 38, web 32 (masking, sync, service with a mocked judge: ladder, SRS, OA deadline, drafts/snapshots), e2e 11 (browse/filter/random/palette, solve in Python and C++, verdicts, custom input, drafts, hidden-content leak scan, hints/editorial, give up, OA, content review). `content:validate --all` passes.
  - Docs: `docs/adding-problems.md`, `prompts/authoring/dsa.md`, SECURITY.md hidden-content section, DECISIONS.md M2.

## In progress
- Nothing. Waiting for the user to test M2.

## Next: M3 — AI layer and interviewer engine
1. Providers (`none`, `ollama`, `openai-compatible`, `anthropic`) behind `LLMProvider`, plus `FakeProvider`; look up current model IDs in each provider's docs and record them in DECISIONS.md; first-run setup page + "Test connection"; encrypted key storage (master key generated into `/data`); token usage + per-session cap.
2. Packet templates in `prompts/packets/` (versioned), Copy prompt / Download .md / Paste reply with JSON-block extraction + Zod validation (see spec §2.4–2.5); every copy/paste logged as events (`packet_copied`, `reply_pasted`).
3. Round state machine with server-side timers and phases; `ScriptedDriver` (uses the problems' `followups` and phase prompts) and `LLMDriver`; leak post-filter (shingle overlap against `private_json`).
4. Scoring (auto/self/ai) and scorecard with the formulas in `packages/shared` (`formula_version`), debrief with timeline replay (events already carry code snapshots from M2), review queue, redo.
5. DSA **interview mode** (strict timer, phases, hints logged and penalized, no editorial until debrief) and **Approach Check**; extend the hidden-content e2e test to cover every API response and page payload in a session (M2 covers the DSA practice flow).
6. History page (`/history`) from sessions/events.

## Known issues
- None known. The company filter has no data yet (`companies: []` on all problems).

## Cut scope
- Java and Node/TypeScript languages (user decision during M1); the runner remains pluggable.
- Warm container pool (optional per spec) — Python runs take ~0.2 s and C++ ~0.6 s including compile.
- Home-page dashboard for due reviews (M8); due reviews are listed on `/dsa` for now.
