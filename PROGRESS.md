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

- **M3 — AI layer and interviewer engine**
  - Providers: `none`, `ollama`, `openai-compatible`, `anthropic` (official SDK, streaming, prompt caching, refusal fallbacks), `fake` (test mode). Models per role with documented defaults and env overrides; encrypted API keys (masked in the UI); Test connection; token usage per session with a cap.
  - First-run `/setup` (skippable) and Settings → AI.
  - Packets (`prompts/packets/`, versioned): live interview, grading (only after the round), approach check; copy / download / paste-back with JSON extraction and Zod validation; every copy, download, and paste logged.
  - Round state machine with server-side phase timers; scripted interviewer (`prompts/interviewer/dsa-scripted.md`, problem follow-ups after a solve); AI interviewer with per-turn context, SSE streaming, leak post-filter with look-behind, nudge logging; fallback to scripted or copy-prompt on AI failure; "interview in another chat" mode.
  - DSA interview mode (`/interview/[id]`): strict 50-minute clock, phases, chat, hints logged and penalized, no editorial until the debrief.
  - Scoring (`packages/shared/src/scoring`, formula v1, docs/scoring.md): auto from events, self checklist, AI grade (connected or pasted); recommendation with hard cap.
  - Debrief (`/debrief/[id]`): scorecard with sources, self-checklist, AI grading (button or packet), timeline replay (code + conversation at any point), editorial, reference solutions, follow-ups, Redo, Add to review queue. History (`/history`).
  - Approach Check (practice): live verdict via the fast model, or packet + paste.
  - Hidden-content e2e: scans every page, API response, and JS bundle during practice and during a full interview (hidden inputs, unrevealed hints, editorial, reference code, rubric, grading instructions), with positive controls.
  - Tests: shared 32, web 58 (leak filter, providers, secrets, config, engine both drivers, packets, grading, scorecard), e2e 18 (DSA 11 + interview/AI 7), all idempotent via test-mode reset.
  - Docs: docs/ai-setup.md, docs/scoring.md, SECURITY.md (keys, leak filter, test mode), DECISIONS.md M3.

## In progress
- Nothing. Waiting for the user to test M3.

## Next: M4 — Recruiter Screen and Behavioral
1. Resumes: paste or PDF upload (server-side text extraction, `unpdf`), saved versions, deterministic parse into sections and bullets; target role, company, job description.
2. Recruiter round: resume phase (scripted deep dives on bullets with numbers/strong claims, then generic recruiter questions; AI: 5–10 resume-specific questions) and CS fundamentals phase (rapid-fire from the bank with adaptive difficulty, key points revealed, self-grade). Resume feedback panel (AI or packet). Packets: live, grading, resume feedback.
3. Behavioral round: question bank with 3–5 follow-ups each and competency tags; story bank (STAR + metrics + reflection + tags) with a competency × story coverage matrix; mock flow (4–6 questions, 1–3 follow-ups, 2–3 minute soft timer per answer); auto signals (duration, word count, I/we ratio, numbers, fillers when voice is on); stronger-version rewrite (AI or packet; never fabricate, list missing facts).
4. Voice input flag (Web Speech API) with the vendor-processing note; WPM and filler counts.
5. Content: CS fundamentals and behavioral schemas + validation (key points; MCQs have exactly one correct option); first batches toward 60 CS / 40 behavioral. Generalize the content loader beyond `dsa` (content types registry) and the scoring rubrics per round type.
6. Extend the interview engine for non-coding rounds (phase plans per round type; scripted drivers from content).

## Known issues
- None known. The company filter has no data yet (`companies: []` on all problems).
- Ollama and real Anthropic calls are implemented and unit-tested with mocked HTTP, but weren't exercised against live services here (no Ollama install; no paid API calls by policy). Test connection in Settings checks both.

## Cut scope
- Java and Node/TypeScript languages (user decision during M1); the runner remains pluggable.
- Warm container pool (optional per spec) — Python runs take ~0.2 s and C++ ~0.6 s including compile.
- Home-page dashboard for due reviews (M8); due reviews are listed on `/dsa` for now.
- Persona/company presets for the interviewer prompt (`persona_suffix` placeholder) arrive with company presets in M8.
