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

## M1
- **Scope: Python and C++ only** (user decision, during M1) — Java and Node/TypeScript sandboxes, drivers, compose profiles, and the "Install language" button are dropped; spec §4, §5.1, §6.2, §8.3, §8.4, §14 and PLAN.md updated.
- Languages stay pluggable: `LANGUAGES` in `packages/shared/src/judge/protocol.ts`, a `LanguageCodegen` per language (`judge/codegen/`), a runner profile per language, and a sandbox image per language — adding one touches only those four places.
- **Sandbox: option A (sibling containers via the Docker socket)** — works identically on Docker Desktop, WSL2, and Linux; option B needs SYS_ADMIN/privileged and cgroup delegation that differ per platform. Details and mitigations in SECURITY.md.
- No docker-socket-proxy — endpoint filtering must still allow container create, so it adds a service without limiting the real risk; the runner's own validation does.
- Hand-written Docker Engine API client (`services/runner/src/docker.ts`) instead of dockerode — ~200 lines; avoids ssh2 and native optional deps.
- Runner bundled with esbuild into one file (`dist/main.mjs`) — runtime image has no node_modules.
- In-container agent (`images/common/agent.py`, Python stdlib) is the entrypoint of every sandbox image — one implementation of time/memory/output enforcement for all languages; the C++ image adds python3.
- Code reaches the container on **stdin** as one JSON bundle — compatible with a read-only rootfs and tmpfs `/work`; nothing is copied in before start.
- DSA runs use one long-lived driver process per container: tests go in one per stdin line, results come back on **fd 3** — keeps the user's stdout separate and avoids per-test process startup; the driver is restarted after a crash, TLE, or MLE so state doesn't leak into later tests.
- Per-test memory = peak RSS after resetting VmHWM (`/proc/pid/clear_refs`), minus memory leaked by earlier tests; MLE if it exceeds the limit, or on OOM kill / MemoryError / bad_alloc — measures the user's process, not the toolchain.
- Container memory = user limit + 384MB — g++ and the agent need room; the user limit is enforced per process as above, and the cgroup is an OOM backstop.
- Wall-clock per test = time limit + 1s slack for input parsing/serialization; reported time is the call itself; total test budget capped at 90s (remaining tests reported as skipped → TLE).
- No per-language time multipliers — problem limits are validated against the Python reference (the slowest supported language).
- Python driver is generic (reads the signature at runtime); C++ gets a generated `main.cpp` per problem over a precompiled runtime header (`swemock.hpp.gch`) — Python needs no codegen; C++ needs static types; the PCH keeps compiles ~0.5s.
- Signature types: `int long double bool char string ListNode TreeNode`, `T[]`, `list<T>`; no arrays of lists — covers LeetCode-style problems; graphs are edge lists.
- Checkers: exact (type-strict: `true != 1`), unordered (optionally nested), float (abs/rel tolerance), custom Python `check(input, expected, actual)` — custom checkers always run in Python regardless of the user's language.
- Stack: 256MB `RLIMIT_STACK` for user processes; Python recursion limit 1e6 — deep recursion is common in DSA solutions.
- Python output unbuffered in the sandbox — output printed before a timeout or crash is still shown.
- Project runs: one shell command from the manifest (or "run current file" built by the language profile) with JUnit XML or a simple JSON results format; categories assigned by regex on `classname.name`.
- Sandbox images run a toolchain self-test as one-shot compose services; the runner waits for them — `docker compose up` builds/pulls the images and proves they work before the app starts.
- Runner secret generated by the runner into a volume mounted read-write in runner and read-only in web; web re-reads it on a 401 — survives volume recreation.
- Runner concurrency 2 with a queue of 20 (429 beyond) — single user; protects the machine from runaway parallel submits.
- Judge playground (`/playground`, linked from Settings) with a built-in sample problem — lets users check the sandbox on their machine independently of any content.
- Pinned toolchains: python:3.12.15-slim-bookworm + pytest 9.1.1; debian trixie-20261005 + g++ 14.2 + doctest 2.5.3 (sha256-verified download).

## M2
- **Content package** (`packages/content`) holds the manifest schema, loader, and public/private split — used by both the web sync and the CLI so they can't disagree about what a problem is.
- Manifest keys are snake_case (`tle_guard`, `time_ms`) — matches the spec's wording; the loader maps to camelCase.
- Tags are a closed list (`DSA_TAGS`) — typos fail validation instead of creating stray tags; adding a topic is one line.
- Problem identity: `content_items.id = "<type>:<slug>"` — deterministic, so sessions, drafts, and cards survive content re-syncs. (The data model elsewhere uses ULIDs.)
- Reference solutions use the LeetCode-style `class Solution` for both languages and run through the same harness as user code — one code path to maintain, and the reference is exactly what a user could write.
- Hidden tests are **generated, then committed** (`tests/hidden.json`): `gen.py` produces inputs (fixed seed), the Python reference produces expected outputs, the C++ reference must agree. Validation reruns `gen.py` and compares — so a generator edit that forgot `content:gen` is caught.
- `captureFull` and `collect` were added to the judge protocol so the tooling can get full expected outputs and files from generators (stdout is capped at 64KB).
- Content tools use the runner's `Judge` in-process (not HTTP) — the runner isn't reachable from the host by design; same sandbox, no extra service.
- `content:validate` with no arguments checks only items changed vs `main` — fast local loop; CI uses `--all`.
- `./content` is bind-mounted read-only into `web`, with a copy baked into the image — `git pull` brings new problems without a rebuild; the baked copy keeps the app working if the mount is missing.
- Content sync is fingerprint-based (path+size+mtime, checked at most every 2 s on reads) plus a hash per item — cheap enough for every request, and new problems appear without a restart. Missing items are soft-deleted so history keeps its references.
- A changed item resets to the manifest's `reviewed` value; approval in the app is a DB override — content is read-only to the app, and approving changed content shouldn't be silent.
- Practice sessions are created lazily on the first run/submit/hint/save, not on page view — viewing a problem writes nothing. A solve or give-up ends the session; the next action starts a new one.
- Practice Submit stops at the first failing test (fast feedback); OA Submit runs every test (partial credit needs the share passed).
- Hidden-test failures show only number, category, verdict and timing — spec §5.4; hidden stdout/stderr/messages are hidden too because a program can print its input.
- Hint ladder: hints 1–4 in order (unless solved), editorial after all four, solved, or an explicit give-up (which also schedules a review) — "can't be skipped" without trapping someone who truly wants the answer.
- Spaced repetition: a card is created when a problem needed help (any hint/editorial, or ≥3 wrong submissions before the solve) or was given up; intervals 1/3/7/14 days; a clean solve of a due card advances it; needing help again resets it; after 14 days it's mastered. A clean first solve creates nothing.
- Efficiency indicator compares the slowest test with the reference's slowest test for the same language (≤3× comparable, ≤10× slower, else much slower; 5 ms noise floor) — rough by design.
- OA: server-side deadline (the client's clock is only for display), settled lazily on any request; the session survives closing the tab; score = mean over problems of best (passed/total).
- Company filter exists but problems ship with `companies: []` — claiming a problem is "asked at X" isn't something I can verify; the control appears once any problem has a company.
- Monaco: editor API + feature registry + python/cpp only, loaded lazily (`next/dynamic`, ssr off) — keeps the initial bundle small and works offline.
- Statements are rendered client-side (react-markdown + remark-math + rehype-katex, KaTeX CSS/fonts bundled) — also needed for editorial text that arrives via API.
- Route groups `(site)`/`(workspace)` — code pages need the full window; other pages keep a readable column.
- Cmd/Ctrl+K palette lists pages and problems — spec §12; plain component, no dependency.
- Playwright e2e runs against a live stack (compose in CI) with the real judge, and derives expectations from the content on disk so adding problems doesn't break tests.
- Test hook `window.__swemockSetCode` targets the visible Monaco editor — typing whole programs through Monaco's auto-indent is unreliable.

## M3
- **Default models** (looked up at implementation time): Anthropic `claude-opus-5-5` for interviewer, assistant, and grader, `claude-haiku-5-5` for the fast role; Ollama `qwen3.5:9b` / `qwen3.5:4b` (current, run on 16 GB machines); OpenAI-compatible has no defaults (endpoints vary) — the user names models.
- Anthropic via the official SDK with streaming, prompt caching on the stable system block (round template + problem + hidden context), and server-side refusal fallbacks (`fallbacks: "default"`) on models that support them — a declined request is re-run on a suitable model within the same call.
- **No temperature on Anthropic**: current Claude models reject sampling parameters; "grader at temperature 0" applies to Ollama/OpenAI-compatible. Grading consistency comes from the fixed rubric, anchors, and JSON schema. Effort is set per call (low for the interviewer and approach checks, medium for grading).
- Ollama and OpenAI-compatible share one fetch-based provider (no SDK for one endpoint), with retry on 429/5xx/network (1 s, 2 s, 4 s).
- Structured output is the same path for every provider and for paste-back: the reply ends with one fenced ```json block, extracted and Zod-validated; connected calls get one automatic repair retry with the validation error.
- Fake provider and data reset are gated by one switch, `SWEMOCK_TEST_MODE=1` — e2e needs both; one switch is easier to keep off in real use.
- Interview timers are server-side and settled lazily on every read (state endpoint polled every 3 s) — survives refreshes and restarts with no background worker.
- Both interviewers open with the scripted greeting — instant and deterministic; the AI takes over from the first candidate message. Phase changes appear as notes; the scripted interviewer also posts the phase's first line, the AI sees the phase in its per-turn context.
- An accepted submission in an interview moves the round to "testing", where the problem's follow-ups are asked first — mirrors real interviews; the session keeps running (unlike practice).
- AI interviewer turn context = elapsed time, phase and time left, a line diff of the code since its last turn (LCS, truncated), and the latest test result; the stable part (template, problem, hidden context) is a separate cached system block.
- Nudges: the model marks them with `<<nudge>>`; the server strips the marker and logs a `hint` event, which counts against the score like a hint.
- **Leak filter**: shingles (8 code tokens ×2, or one 10-word prose shingle) plus a code-block rule in interview mode, applied while streaming with a 160-character look-behind and fence hold-back — found during testing that without the look-behind the first part of a leaked solution reached the browser before detection.
- Scripted lines live in `prompts/interviewer/dsa-scripted.md` (one section per phase) — editable without code, versioned like other prompts.
- Packets: live (problem + rules only), grading (after the round; rubric, anchors, editorial for calibration, transcript, events, final code), approach check. The connected grader receives the grading packet itself as its user message, so live and pasted grading are identical inputs.
- Interviews can run "in another chat" (live packet); the pasted conversation is included in the grading packet.
- Scoring formula v1 (docs/scoring.md): ai > self > auto per dimension; red flags −30 points; recommendation needs a self or AI score; cap at Lean No Hire if hidden tests never all passed.
- Rubrics are hidden until the debrief: served only after the round and imported via `@swemock/shared/scoring` so they never reach client bundles.
- On AI failure the interview offers "continue with the scripted interviewer" or "switch to copy-prompt"; both flip the session's driver.
- First run: the home page redirects to `/setup` until setup is completed or skipped — other URLs work immediately.
- Bundled Ollama is an optional compose service under the `local-ai` profile (pinned `ollama/ollama:0.40.3`, models in a named volume); host Ollama stays the recommendation on macOS.
- Approach Check lives in a practice-mode tab; connected uses the `fast` role, otherwise a packet with paste-back.

## M4
- **One folder per question** (`content/cs/<slug>/question.yaml`, `content/behavioral/<slug>/question.yaml`) instead of a bank file per topic — the same sync, review, soft-delete, and "drop a folder in" flow as DSA, and diffs stay small. The loader has a registry (`CONTENT_TYPES` plus a loader and a public/private split per type), so a new type is a few lines.
- Closed vocabularies for CS topics, behavioral competencies, and company lenses (in `packages/shared/src/rounds/competencies.ts`) — typos fail validation instead of creating stray tags. Lenses are short tags with our own wording, never the companies' published text.
- Unquoted YAML list items such as `- Average O(1): hash the key` parse as one-entry mappings; the schema turns them back into text rather than making authors learn YAML quoting.
- `content:validate` checks questions statically (no Docker) and only starts the sandbox when a DSA item is in the batch; duplicate titles and prompts are checked against every question on disk, not just the batch.
- **Round adapters**: the engine keeps the clock, phases, and logging; a `Round` (`server/interview/rounds/`) owns what the app says (opening, phase start, reply to the candidate, and an optional pre-AI hook). Coding rounds use the same adapter, moved out of the engine unchanged. Round state lives in `sessions.state_json` (`round`).
- Recruiter screen is 28 minutes (spec: 20–30): background 10, fundamentals 15, the candidate's questions 3. Behavioral is 2 + 6 per question + 3 (35 minutes for four questions, 41 for five).
- The scripted recruiter's resume lines are built once at the start from the deterministic parse: greeting, up to three deep dives (highest-scoring bullets, at most two per entry; the lead-in is "Tell me more about: …"), the job-description line if there is one, motivation, two logistics lines. When the lines run out the screen moves on by itself.
- Fundamentals pool of 12 per screen (4 easy, 5 medium, 3 hard when the bank allows, topics spread within each band); the screen starts easy, "got it" moves up a level, "missed" moves down. Only `short` questions are used; MCQs are for the quiz mode (M7).
- The candidate's self-grades (got it / partly / missed) count as **auto** for the fundamentals dimension — recorded one question at a time while the key points are on screen, not editable afterwards; the checklist and AI still override. Documented in docs/scoring.md.
- Behavioral follow-ups are chosen from the answer: no "I" (under 40% singular) → "What did YOU specifically do?", no number → "What was the measurable result?", otherwise the next authored follow-up; at most two per question (spec allows 1–3). Time to answer is measured from the question to the message, so it includes thinking time.
- Answer signals are deterministic and unit-tested: "our/ours/us" count as "we"; years aren't numbers; a message under 25 words is a reply, not an answer; fillers and words per minute only for voice answers, pace only from five seconds of speech.
- Soft timer per answer is a bar that goes green → amber at 2:00 → red at 3:00 — a nudge, never a cutoff (spec: soft timer).
- **Voice** is a feature flag (Settings → Voice input), off by default; browser Web Speech API only, with the vendor-processing disclosure in Settings and next to the mic. The app receives text and speech milliseconds, never audio. Headless tests use a stand-in recognizer.
- **Never fabricate**: a stronger version or resume rewrite is rejected if it contains a number that isn't in the candidate's own words, resume, or saved story notes. It's a mechanical check on numbers only (names and claims can't be verified), applied to connected replies (one automatic retry) and pasted ones alike. The prompts also say so, and ask for missing facts to be listed instead.
- The leak filter now also catches a short secret (6–9 words, such as a one-line key point) quoted whole; shingles can't see sources shorter than 10 words.
- Resume versions are immutable (edit = new version); a session keeps its own copy of the resume text, so deleting a version never breaks history or a redo. PDF text extraction uses `unpdf` (pure JS, no binary) behind a 5 MB / 8 page limit.
- Story bank coverage: a *gap* is a competency with no story; *thin* has exactly one; a story is flagged *over-relied-on* when it is the only story for three or more competencies. These thresholds are constants in `packages/shared/src/rounds/coverage.ts`.
- With the AI driver, the first candidate reply in a behavioral interview opens the question phase (a phase notice, then the model answers); in the recruiter screen the model gets a scripted bridge line when a phase changes, so it never waits for the candidate to speak first.
- Live packets for these rounds contain the candidate's own material (resume, job description) and question prompts (behavioral also the suggested follow-ups), never key points, strong-answer signals, or the rubric; grading and feedback packets exist only after the round.
- Cut from M4: spaced repetition for CS questions and a standalone CS quiz (M7's fundamentals quiz covers both); persona/company presets stay in M8.
