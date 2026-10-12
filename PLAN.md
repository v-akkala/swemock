# swemock: build plan

Status: **draft, waiting for "go"**. This plan is written against spec.md (single source of truth). Nothing existed before it (no earlier PLAN.md, DECISIONS.md, or code), so there was nothing to reconcile.

Working agreement: after "go", I build one milestone at a time and **stop at the end of each one** so you can test it. Each milestone section below ends with "How you test it".

---

## 1. Architecture

```
 browser ──HTTP/SSE──▶ web (Next.js, 127.0.0.1:3000)
                        │  API route handlers, server components
                        │  SQLite (Drizzle) ── /data (volume swemock-data)
                        │  content loader ◀── /app/content (bind-mounted repo ./content)
                        │  AI layer (providers, drivers, packets, grader)
                        │
                        └─HTTP + HMAC secret (internal network only)─▶ runner
                                                                       │ Docker socket (runner only)
                                                                       ▼
                                                     sibling sandbox container per run
                                                     (swemock-sandbox-{python,cpp,java,node})
 ollama (optional, profile local-ai) ◀── web, or host Ollama via host.docker.internal
```

### 1.1 web (`apps/web`)
- Next.js App Router, `output: "standalone"`, TypeScript strict, Tailwind, shadcn/ui.
- All server logic lives in `apps/web/src/server/` and is only imported from route handlers and server components (enforced with `import "server-only"`).
  - `db/`: Drizzle schema, migrations, startup backup + migrate.
  - `content/`: loader, hash-based sync, public/private splitting.
  - `judge/`: client for the runner, verdict mapping.
  - `ai/`: `LLMProvider` interface + `none` / `ollama` / `openai-compatible` / `anthropic` / `fake`.
  - `interview/`: round state machine, `ScriptedDriver`, `LLMDriver`, leak post-filter, timers.
  - `packets/`: renders `prompts/packets/*` templates; paste-back JSON extraction.
  - `scoring/`: glue to the formulas in `packages/shared`.
  - `crypto/`: local master key, AES-256-GCM for secrets.
- **Timers**: phase start times and durations are rows in the DB; the client derives the countdown from server time (sent with every response), so refreshes and restarts don't reset anything.
- **Streaming**: SSE endpoints for interviewer/assistant/grader output.
- **Hidden content boundary**: every content item is split at sync time into `public_json` (safe for the browser) and `private_json` (reference solutions, hidden tests, manifests, rubrics). Only the debrief endpoint, after the session is `ended`, may read `private_json`. A single serializer module is the only path from content rows to responses.

### 1.2 runner (`services/runner`)
- Small Node + TypeScript service (node:http, Zod, dockerode). No published ports.
- Every request carries `Authorization: Bearer <secret>`; compared in constant time. Requests are Zod-validated: language allowlist, file count and size caps, limit caps.
- Launches only images from a hard-coded allowlist (`swemock-sandbox-<lang>:<pinned version>`); the image name is never taken from the request.
- Two endpoints: `POST /v1/dsa` (compile once, run N tests, check) and `POST /v1/project` (copy workspace, run a manifest command, parse JUnit XML / JSON). `GET /healthz` reports Docker reachability and installed sandbox images. `POST /v1/images/pull` installs Java/Node on request.

### 1.3 Sandbox containers (`images/`)
- One image per language, each with its toolchain and test framework preinstalled (Python 3.12 + pytest; g++ C++20 + vendored doctest; Java 21 + vendored JUnit 5 console launcher; Node LTS + TypeScript + node:test).
- Every image contains `/sandbox/agent.py`, a stdlib-only Python script (python3 is added to the non-Python images; ~10MB). The container's entrypoint is the agent:
  1. reads one JSON bundle (files + tests + limits) from **stdin**, writes files to `/work` (tmpfs);
  2. compiles if needed (compile errors → `Compile Error`);
  3. runs each test as a child process with a per-test wall-clock timeout, measuring time and peak RSS (`getrusage`), and detecting OOM kills via the cgroup v2 `memory.events` counter;
  4. runs the checker (checkers are always Python, whatever the user's language);
  5. prints one JSON result document to stdout, truncated to 64KB.
- Passing the bundle via stdin is what makes a read-only rootfs + tmpfs `/work` workable: nothing is copied into the container before it starts.
- The runner applies the container limits from spec §5.1 and an outer hard-kill deadline (sum of per-test timeouts + compile budget, capped), then removes the container.

### 1.4 DSA harness: one signature, generated drivers
This is the main thing that makes adding problems cheap. A problem declares its signature **once**, in a language-neutral form:

```yaml
signature:
  kind: function            # or: design
  name: maxSubarraySum
  params:
    - { name: nums, type: "int[]" }
    - { name: k, type: int }
  returns: long
checker: exact               # exact | unordered | float:1e-6 | custom
```

Type grammar: `int | long | double | bool | string | T[] | T[][] | ListNode | TreeNode | Graph` (Graph = `{n, edges}`). Design problems list methods with their own params/returns and use the LeetCode-style `["Ctor","op",...], [[args],...]` test format.

`packages/shared/src/codegen/` turns the signature into, for each of Python, C++, Java, TypeScript:
- the starter stub shown in the editor, and
- the driver (JSON parse → build ListNode/TreeNode → call → serialize).

Authors never write drivers. Adding a new *type* is a codegen change made once, with unit tests.

### 1.5 AI layer
- `LLMProvider { chat(stream), json<T>(schema), usage }` with four implementations plus `FakeProvider` (scripted, deterministic; the only provider used in tests/CI).
- Anthropic via `@anthropic-ai/sdk`, with prompt caching on the static system prompt. Ollama and OpenAI-compatible via plain `fetch` to `/v1/chat/completions` (no extra SDK).
- Model defaults per role are looked up from each provider's docs at M3 and recorded in DECISIONS.md. Grader always runs at temperature 0.
- Every AI touchpoint is a declared **Touchpoint** object `{ id, packetTemplate, replySchema?, connectedHandler, fallback }`. The UI component `<AiTouchpoint>` renders the right level (connected / copy-prompt + paste-reply / built-in fallback) from it, so no screen can end up dead.
- Paste-back: extract the last fenced `json` block → Zod; on failure show the error, keep raw text, allow editing the JSON.
- Leak post-filter: n-gram (token shingles) overlap between the model's response and the item's `private_json` text fields + normalized reference code; above a threshold the response is replaced with a safe nudge and the event is logged.

### 1.6 Scoring (`packages/shared/src/scoring/`)
Pure functions, versioned by `FORMULA_VERSION`, unit-tested:
- self-checklist → 1–4 band from weighted coverage;
- per-round auto metrics → dimension scores;
- annotation matching (±2 lines + category) for AI Fluency, severity-weighted precision/recall;
- recommendation with hard caps (e.g. DSA hidden tests failing → max Lean No Hire);
- merge rule: per dimension, prefer `ai` > `self` > `auto` where a dimension has several sources, and always show every source.

---

## 2. Data model (Drizzle / SQLite)

All tables have `id` (text ULID) and `created_at`; user-owned tables have `user_id` (one default user).

| Table | Key columns |
| --- | --- |
| `users` | name |
| `settings` | `key`, `value_json` (provider, role→model map, feature flags, token cap, onboarding_done) |
| `secrets` | `name`, `ciphertext`, `iv`, `tag` (master key lives in `/data/master.key`, mode 0600) |
| `resumes` | `version`, `title`, `text`, `source` (paste/pdf), `parsed_json` |
| `content_items` | `type`, `slug`, `version`, `title`, `difficulty`, `tags_json`, `public_json`, `private_json`, `source`, `reviewed`, `content_hash`, `deleted_at` |
| `sessions` | `round_type`, `item_id`, `mode` (practice/interview/oa), `driver` (scripted/llm), `provider`, `loop_id`, `status`, `started_at`, `ended_at`, `phase_plan_json`, `state_json` |
| `events` | `session_id`, `ts`, `kind` (spec §11 list), `payload_json` — append-only |
| `drafts` | `session_id` or (`item_id`,`language`), `files_json`, `updated_at` (autosave target) |
| `submissions` | `session_id`, `language`, `kind` (run/submit), `verdict`, `passed`, `total`, `results_json`, `runtime_ms`, `memory_kb` |
| `scorecards` | `session_id`, `dimensions_json` (score, source, evidence), `recommendation`, `grader` (model id / "pasted" / "self"), `prompt_version`, `formula_version` |
| `stories` | STAR fields, `competencies_json` |
| `srs_cards` | `item_id`, `kind`, `due_at`, `interval_idx`, `last_result` |
| `loops`, `loop_rounds` | preset id, order, duration, break, `session_id` |
| `token_usage` | `session_id`, `role`, `model`, input/output/cache tokens |
| `content_meta` | last sync hash, sync log |

Events are the source of truth for replay; snapshots and scorecards are derived and can be recomputed.

---

## 3. Directory layout

```
apps/web/                     Next.js app
  src/app/                    routes: /, /setup, /settings, /dsa, /dsa/[slug], /session/[id],
                              /debrief/[id], /lld, /ai-fluency, /behavioral, /recruiter, /ml,
                              /loops, /analytics, /history, /content-review
  src/components/             ui (shadcn), editor, whiteboard, ai-touchpoint, timer, chat …
  src/server/                 see §1.1
  drizzle/                    checked-in migrations
  e2e/                        Playwright
services/runner/              runner service + containment tests
packages/shared/              Zod schemas, types, codegen, scoring formulas
images/sandbox-{python,cpp,java,node}/   Dockerfiles; images/common/agent.py
prompts/
  interviewer/ grader/ packets/   versioned templates (front-matter `version:`)
  authoring/<type>.md             guides for drafting content with any AI tool
content/                       layout exactly as spec §3
  dsa/<slug>/
    problem.yaml               manifest (metadata, signature, checker, limits, hints, follow-ups)
    statement.md  editorial.md
    solutions/reference.py  reference.cpp  [brute.py] [reference.java|ts]
    tests/visible.json  tests/gen.py  tests/hidden.json (generated, committed)
    checker.py                 only for checker: custom
scripts/                       content:new, content:validate, content:sync, content:gen
docs/
compose.yaml  compose.dev.yml  .github/workflows/
PLAN.md DECISIONS.md PROGRESS.md CLAUDE.md SECURITY.md README.md …
```

### 3.1 Making new problems easy (spec §6.4)
1. `pnpm content:new dsa my-problem` scaffolds the folder with every file pre-filled with a commented example.
2. The author writes: statement, signature, Python + C++ reference, `gen.py`, hints, editorial. No drivers, no stubs, no registration anywhere.
3. `pnpm content:gen dsa/my-problem` runs the generator and computes expected outputs with the reference in the real sandbox.
4. `pnpm content:validate dsa/my-problem` validates just that item in seconds; with no argument it validates items changed vs `main`; `--all` for CI.
5. The running app picks it up automatically: the repo's `./content` is bind-mounted read-only into `web`, and a content hash check on startup and on a 10s dev-mode watcher re-syncs. Users of the prebuilt image get new content with `git pull` alone, no image rebuild.
6. `prompts/authoring/dsa.md` is a self-contained brief you can hand to any AI to draft an item that will pass validation.

---

## 4. Sandbox decision (spec §5.1): **Option A, sibling containers via the Docker socket**

**Why A**
- Works the same on Docker Desktop (macOS, Windows/WSL2) and Linux. Option B (nsjail/isolate) needs `CAP_SYS_ADMIN` or `privileged`, user-namespace and cgroup v2 delegation inside a container; that is exactly where Docker Desktop's VM and rootless setups differ and break, and a one-command install can't absorb that.
- Each run gets Docker's own isolation (namespaces, cgroups, default seccomp, dropped caps), which is well understood and auditable.
- Different language images are natural with A; with B the runner image would have to carry every toolchain.

**Cost and mitigations**
- The socket is root-equivalent on the host. Mitigations: socket mounted only into `runner`; runner has no published port and sits on an internal network; every request authenticated with a generated secret; requests strictly validated; image names come from a hard-coded allowlist, never from input; container create options are built only by the runner (no bind mounts, no privileged, `NetworkMode: none`, `ReadonlyRootfs`, tmpfs `/tmp` and `/work` with `noexec` off only for `/work`, `User: 65534`, `CapDrop: ALL`, `no-new-privileges`, `Memory`, `NanoCpus: 1e9`, `PidsLimit: 64`); the runner itself never executes user code. Considered adding a docker-socket-proxy that only permits container create/start/attach/wait/kill/delete and image list/pull: I plan to include it (`tecnativa/docker-socket-proxy`-style, pinned) if it doesn't hurt reliability on Docker Desktop; decided in M1 and recorded.
- Latency: container start is ~300–700ms. One container per Run/Submit (all tests in that container), not per test. A warm pool is cut for now and noted as optional.

Containment tests in M1: infinite loop, fork bomb, memory hog, network attempt, write outside /work — all must yield the correct verdict and leave the host unaffected.

Recorded again in DECISIONS.md and SECURITY.md at M1.

---

## 5. Milestones

Every milestone ends with: typecheck, lint, unit tests, `content:validate`, sandbox tests, relevant e2e → fix failures → update PROGRESS.md / CLAUDE.md / DECISIONS.md → commit and push → **stop for you to test**.

### M0 — Scaffold and distribution skeleton
- pnpm monorepo, Next.js shell with nav (all round pages exist as placeholders that say "coming in Mx" — these are navigation entries, not feature stubs), dark/light toggle.
- SQLite + Drizzle, startup backup to `/data/backups/` (keep last 10) then migrate.
- Settings page with provider `none` persisted.
- `compose.yaml` (GHCR images, `127.0.0.1` binding, `swemock-data` volume), `compose.dev.yml` (build from source, hot reload). Until the first release, `compose.yaml` can't pull images that don't exist yet, so it will build locally as a fallback (`build:` + `image:`); M10 switches it to pinned GHCR pulls.
- CI skeleton (typecheck, lint, unit). CLAUDE.md, .gitignore, .gitattributes, .env.example, LICENSE.
- **How you test it:** `docker compose up -d` → http://localhost:3000 shows the shell; change a setting, restart the container, it persists; `/data/backups` has a backup.

### M1 — Judge
- Sandbox images (Python, C++, then Java, Node), `agent.py`, runner service, codegen for drivers/stubs, checkers, project runs with JUnit/JSON parsing, health endpoint, language install button.
- Containment tests.
- **How you test it:** `pnpm test:sandbox`; a dev-only `/dev/judge` page to paste code and run it in each language and watch verdicts (TLE, MLE, RE, CE included).

### M2 — DSA practice (no AI)
- DSA content schema + validator + generator flow + `content:new`; **15 problems** across difficulties and topics.
- Problem browser (filters, constrained random picker), split-pane editor with Monaco (bundled), language switcher with per-language drafts, custom input, Run/Submit, verdict panel with per-test runtime/memory and efficiency indicator.
- Hint ladder, editorial after submit/give-up, OA mode (2 problems, partial credit), spaced repetition (1/3/7/14 days), keyboard shortcuts.
- **How you test it:** solve and fail problems in each language; run `pnpm content:new` + validate on a throwaway problem.

### M3 — AI layer and interviewer engine
- Providers + FakeProvider, first-run setup + test connection, encrypted keys, token usage + cap.
- Packet templates, copy/download/paste-back, Touchpoint framework.
- Round state machine with server timers, ScriptedDriver, LLMDriver, leak post-filter.
- Scoring (auto/self/ai), scorecard, debrief with timeline replay, review queue, redo.
- DSA interview mode, Approach Check, hidden-content e2e test.
- **How you test it:** full DSA interview with provider `none` (scripted + packets pasted from claude.ai), then with Ollama or your key.

### M4 — Recruiter Screen and Behavioral
- Resume paste/PDF extraction/versions + deterministic bullet parser; story bank + coverage matrix; voice flag (WPM, fillers).
- Seeds: CS fundamentals and behavioral questions (first batches toward 60 / 40).
- **How you test it:** run both rounds in both modes with and without AI.

### M5 — LLD
- Formats A and B, edit-tracking on file 1, requirement-change mechanic with extension tests, design-review checklist, Mermaid in debrief. **8 problems** (Python + one compiled language each).

### M6 — AI Fluency
- CoderPad-like workspace, assistant panel (connected + packet), diff preview with per-hunk apply, full logging.
- Fallible mode: AST/token-level mutation operators, syntax re-check in the sandbox, catch detection.
- Comprehension (gutter annotations + matching), code review PR view, feature extension. **4 items each.**

### M7 — ML rounds
- Excalidraw (self-hosted) whiteboard → text graph, notes templates, curveball timeline.
- System design, serving, distributed training, applied: **3 items each**; fundamentals quiz + flashcards + SRS (first batch of questions).

### M8 — Loops and analytics
- Loop builder + 7 presets, 6 company presets, hiring-committee packet; dashboard (streak, due reviews, recommendation), analytics, history, JSON export/import, markdown debrief export.

### M9 — Content and polish
- Reach the v1.0 targets in spec §6.3 in batches of ~10, each validated and committed separately: DSA 50, CS 60, LLD 12, comprehension 6, review 8, extension 4, behavioral 40, ML SD 12, serving 8, dist-training 8, applied 10, ML fundamentals 80, companies 6, loops 7.
- e2e for every round type × both modes × {provider none, FakeProvider}.

### M10 — Public release
- Release workflow (buildx multi-arch → GHCR, pin version in compose.yaml, GitHub Release), README/docs/repo files, CI smoke test with web egress blocked, fresh-machine install, tag v1.0.0.

---

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Docker socket is host-root equivalent | §4 mitigations; documented threat model in SECURITY.md |
| MLE vs TLE vs RE detection differs across cgroup setups (Docker Desktop vs Linux) | Read `memory.events` inside the container; fall back to exit signal + peak RSS heuristics; containment tests on both macOS and Linux CI |
| JVM and Node misbehave with tight memory limits | Per-language memory headroom and JVM flags (`-Xmx` below the cgroup limit, `-Xss`), documented per-language multiplier on time limits |
| `better-sqlite3` native module inside Next standalone, multi-arch | Build inside the target arch with buildx; smoke test both arches in release CI |
| Bundling Monaco, Excalidraw, Mermaid, KaTeX, fonts locally with Next | Load with `next/dynamic` (client-only), copy assets to `public/` at build; offline e2e run with network blocked |
| Leak filter false negatives/positives | Threshold tuned by tests over the content bank; the hidden-content test guards the API side independently |
| Fallible-mode mutations producing invalid code | Operators work on tokens with language-aware patterns, then a sandbox parse/compile check; on failure, skip mutation (logged) |
| Content volume (hundreds of items) dominates M9 time | Batching per spec; generator-based tests; validation is the quality gate |
| Model IDs drift | Defaults in one file, overridable in Settings and env |
| No git remote may be configured | I'll check at M0; if none, I commit locally and tell you instead of pushing |

## 7. Open decisions (I'll use these defaults unless you say otherwise)

1. **Sandbox:** Option A (sibling containers), with a restricted socket proxy if it proves reliable on Docker Desktop.
2. **Content delivery:** bind-mount the repo's `./content` into `web` read-only, so `git pull` or local additions show up without rebuilding images. Content is also baked into the image as a fallback if the mount is missing.
3. **Pre-release compose:** `compose.yaml` builds locally until v1.0.0 images exist on GHCR.
4. **C++ test framework:** doctest (single header). Java: JUnit 5 console standalone jar. TS: `node:test` with `tsx`.
5. **Package choices (pinned, minimal):** next, react, drizzle-orm + better-sqlite3, zod, @monaco-editor/react + monaco-editor, @excalidraw/excalidraw, katex, mermaid, unpdf (PDF text), @anthropic-ai/sdk, dockerode, tailwind + shadcn/ui, vitest, playwright, eslint, js-yaml.
6. **Default ports/names:** `SWEMOCK_PORT=3000`, volume `swemock-data`, images `ghcr.io/<owner>/swemock-*` — I need the GitHub owner name when we get to M10.
7. **Placeholder routes in M0:** nav links to not-yet-built rounds show a "planned for Mx" page. If you'd rather hide them until built, say so.

---

## 8. Spec edits made while planning
- Applied the two notes at the end of spec.md: §6.3 now has the reduced v1.0 targets (larger ones moved to a "Later releases" column), and the "make adding problems easy" requirement moved into §6.4. Plan milestones M5–M9 use the new numbers.
