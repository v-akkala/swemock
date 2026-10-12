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

- **M4 — Recruiter Screen and Behavioral**
  - **Content types** `cs` (CS fundamentals) and `behavioral`: one `question.yaml` per folder, Zod schemas with closed vocabularies, public/private split (key points, correct options, follow-ups, strong-answer signals are private), `content:new cs|behavioral`, static `content:validate` (no Docker; duplicates checked across the whole bank), authoring briefs `prompts/authoring/{cs,behavioral}.md`, docs in `docs/adding-problems.md`. Loader registry generalized beyond `dsa`.
  - **Seeds:** 30 CS questions (12 easy, 14 medium, 4 hard, all topics except Java) and 20 behavioral questions (3–5 follow-ups each, competency tags, company-lens tags), committed in validated batches of 10.
  - **Round adapters:** the interview engine is round-agnostic (`server/interview/rounds/`); the coding round was moved onto the same interface unchanged; the shared interview page logic is now `components/interview/use-interview.ts`.
  - **Resumes:** paste or PDF upload (`unpdf`, server-side, 5 MB / 8 pages, magic-number check), immutable numbered versions, deterministic parser (sections, entries, bullets, flags for metrics, claims, buzzwords, vague wording) with a preview of what a recruiter would probe.
  - **Recruiter screen** (28 min): scripted deep dives on flagged bullets, motivation, logistics; adaptive fundamentals (easy start, up on "got it", down on "missed") with key points revealed after each answer and self-grading; AI interviewer with the resume, job description, and hidden pool; live packet; grading packet; resume feedback (connected or packet) with a "no invented numbers" check; debrief with fundamentals review and probed bullets.
  - **Behavioral** (4–6 questions): scripted flow with signal-driven follow-ups (≤2), soft 2–3 minute timer bar, company lens and competency focus, AI interviewer, live/grading/rewrite packets, auto signals (words, time to answer, I/we, numbers, fillers and pace for voice), stronger-version rewrites that can't invent numbers, debrief that reveals strong-answer signals and follow-ups.
  - **Story bank** (`/behavioral/stories`): STAR + metrics + reflection + competency tags, competency × story coverage matrix flagging gaps, single-story competencies, and over-reliance.
  - **Voice input flag** (Settings): Web Speech API in the browser, with the vendor-processing disclosure; filler words and words per minute in the debrief. Typing always works.
  - **Scoring:** recruiter and behavioral rubrics and auto scores in `@swemock/shared/scoring` (formula v1, docs/scoring.md); scorecard, packets, grading, redo, history, and debrief generalized per round type. Leak filter now also catches short secrets quoted whole.
  - **Tests:** shared 47, content 10, scripts 4, web 78 (adds round engine for both drivers and the fake AI, packets and feedback validation, story bank, resume versions, PDF extraction, leak filter), e2e 28 (new `rounds.spec.ts`: 10 — PDF upload and versions, recruiter and behavioral in every interviewer mode, hidden-content scans, voice with a stand-in recognizer, story bank, AI with the fake provider). `content:validate --all` passes.

## In progress
- Nothing. Waiting for the user to test M4.

## Next: M5 — Low-Level Design
Both formats (complete-the-system with a starter repo, and implement-the-class), edit tracking on file 1, the requirement-change mechanic with extension tests, design-review checklist, Mermaid in the debrief, 8 problems in Python and C++ where practical. Project runs already work in the judge (M1).

## Known issues
- Ollama and real Anthropic calls are implemented and unit-tested with mocked HTTP, but weren't exercised against live services here (no Ollama install; no paid API calls by policy). Test connection in Settings checks both.
- Voice input was tested with a stand-in recognizer only; real browser speech recognition (Chrome/Edge/Safari) is untested here.
- Resume parsing is heuristic: unusual layouts (multi-column PDFs) may split bullets oddly; paste the text instead and check the preview.

## Cut scope
- Java and Node/TypeScript languages (user decision during M1); the runner remains pluggable.
- Warm container pool (optional per spec) — Python runs take ~0.2 s and C++ ~0.6 s including compile.
- Home-page dashboard for due reviews (M8); due reviews are listed on `/dsa` for now.
- Persona/company presets for the interviewer prompt (`persona_suffix` placeholder) arrive with company presets in M8.
- Spaced repetition and a standalone quiz for CS questions: arrives with the fundamentals quiz and flashcards in M7. MCQ questions are supported by the schema but none ship yet.
- Remaining content toward the v1.0 targets (CS 30 of 60, behavioral 20 of 40) is M9.
