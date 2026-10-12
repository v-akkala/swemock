# swemock: product and build spec

This file is the single source of truth for building swemock. It replaces any earlier SPEC.md, including addenda that were appended to the end of it.

## 0. How to work

**Before writing code**
- If PLAN.md, DECISIONS.md, or code already exist from an earlier version of this spec, first reconcile them with this version. Record what changed in PROGRESS.md.
- Write PLAN.md covering:
  - architecture
  - data model
  - directory layout
  - milestone breakdown
  - risks and open decisions, including the sandbox choice in §5.1
- Then stop and wait for me to reply "go".

**After "go"**
- Work through the milestones in §14 in order. Don't ask questions unless you are truly blocked.
- Choose sensible defaults and record each one in DECISIONS.md with a one-line rationale.
- Keep CLAUDE.md current. It covers how to run (prod and dev), how to test, how to add content, an architecture summary, conventions, and gotchas. Keep it short enough to reread at the start of every session.
- Keep PROGRESS.md precise enough that a fresh session with no prior context can continue exactly where the last one stopped. It lists what's done, in progress, next, known issues, and cut scope.

**After every milestone and every content batch**
- Run typecheck, lint, unit tests, `content:validate`, the sandbox tests, and the relevant Playwright e2e tests.
- Fix every failure before moving on.
- Update PROGRESS.md.
- Commit with a descriptive message, then push to origin.

**Rules**
- Never commit secrets.
- Never call a paid API from tests or CI. Use the fake provider (§2.6).
- Don't ship half-built features with TODO stubs. If something is cut, record it in PROGRESS.md.
- Prefer boring, well-supported libraries. Pin exact versions and keep the dependency count low.

## 1. Product overview

swemock is a free, open-source, local-first platform for practicing software engineering and ML engineering interviews. It lives in a public GitHub repo.

- Anyone can clone it and run it on their own computer with one command.
- Each install is single-user, keeps all data locally, and costs nothing to run.

It simulates real interview rounds with:
- a real sandboxed code-execution judge
- strict timers and phase structure
- an interviewer that is either scripted (no AI needed) or AI-driven (optional)
- rubric-based scorecards that combine objective metrics, self-scoring, and optional AI grading

**Round types**
1. Recruiter Screen: resume walkthrough plus CS fundamentals.
2. DSA: LeetCode-style problem solving.
3. Low-Level Design (LLD): two formats.
4. AI Fluency: code comprehension, AI-generated code review, and feature extension.
5. Behavioral.
6. ML: system design, inference and serving, distributed training, fundamentals, and applied ML design.

**Modes.** Every round has both:
- **Practice:** a soft timer or none, the hint ladder, and the editorial or reference available after submitting or giving up.
- **Interview:** a strict timer and an interviewer. No editorial until the debrief. Hints are logged and lower the score. A full scorecard at the end.

**Mock Loops** chain several rounds together and end with a hiring-committee packet.

**Core principles**
1. **Zero cost by default.** Every feature works end to end with no AI model configured.
2. **Local and private.** No accounts and no telemetry. No outbound network calls except to an AI provider the user explicitly configures.
3. **One-command install.** The host needs only Docker and git.
4. **Machine-validated content.** Content quality is enforced by automated validation, not trust.

## 2. AI layer

### 2.1 Providers
The `provider` setting takes one of these values:
- `none`: the default.
- `ollama`: free local models through Ollama's OpenAI-compatible endpoint.
- `openai-compatible`: any endpoint that implements the OpenAI chat-completions API, with a user-supplied base URL, key, and model names.
- `anthropic`: the user's own Anthropic API key, through the official TypeScript SDK.

All providers sit behind one `LLMProvider` interface that supports:
- streaming chat
- structured JSON output validated with Zod
- token usage reporting

All model calls run server-side and stream to the UI over SSE.

### 2.2 Model roles
- There are four roles: `interviewer`, `assistant`, `grader`, and `fast`.
- In Settings, each role maps to a model ID for each provider. Env vars can override these: `SWEMOCK_PROVIDER`, `SWEMOCK_MODEL_INTERVIEWER`, `SWEMOCK_MODEL_ASSISTANT`, `SWEMOCK_MODEL_GRADER`, `SWEMOCK_MODEL_FAST`.
- Ship documented defaults for each provider. Look up current model IDs in each provider's docs when you implement this.
- The grader runs at temperature 0.

### 2.3 Setup and key storage
- **First-run setup page:**
  - Offers none, Ollama, OpenAI-compatible, or Anthropic, with a "Test connection" button.
  - Can be skipped, which leaves the provider at `none`.
- **Settings** can change the provider at any time.
- **API keys:**
  - Stored only in the local data volume, encrypted at rest with a key generated locally on first start.
  - Never logged.
  - Never returned to the browser after saving; the UI shows them masked.

### 2.4 Three levels for every AI touchpoint
Every place the app could use a model must support all three of these levels:

1. **Connected.** When a provider is configured, the feature runs live in the app.
2. **Copy-prompt.** When the provider is `none`:
   - "Copy prompt" and "Download as .md" buttons produce a self-contained packet the user can paste into any chatbot. Packets should work well in claude.ai.
   - A "Paste reply" box saves the chatbot's reply into the session.
   - When structured output is expected, the packet tells the AI to end its reply with exactly one fenced `json` block matching a documented schema. The app extracts that block and validates it with Zod. On failure it shows the error, keeps the raw text, and lets the user fix the JSON.
3. **Built-in fallback.** Scripted or deterministic behavior that needs no AI at all. §8 specifies it per round.

The app never shows a dead or disabled screen because no model is configured.

### 2.5 Packet rules
- Packet templates live in `prompts/packets/`, are versioned, and are rendered server-side.
- **Live packets** run a mock interview in another chat. They never include:
  - reference solutions
  - hidden tests
  - planted-bug manifests
  - rubrics
- **Grading packets** are available only after the round ends, and may include rubrics and manifests.
- Every packet:
  - wraps files, code, transcripts, and annotations in clear delimiters
  - states the expected reply format
- Every copy, download, and pasted reply is logged as a session event.

### 2.6 Testing
- A deterministic `FakeProvider` returns canned and scripted responses.
- All unit and e2e tests use it.
- CI never calls a real API.

## 3. Tech stack
- **Repo and app:**
  - pnpm workspaces monorepo.
  - Next.js (App Router) with standalone output for Docker.
  - TypeScript in strict mode, Tailwind, and shadcn/ui.
- **Editor:** Monaco (@monaco-editor/react) with multi-file tabs and a file tree. Monaco is bundled locally; don't use the CDN loader.
- **Database:** SQLite through Drizzle ORM. Migrations are checked in, and the database file lives in the data volume.
- **Validation:** Zod for all API inputs, content manifests, and structured model output.
- **Whiteboard:** embedded Excalidraw with self-hosted assets. Persist the scene JSON.
- **Rendering:** KaTeX for math and Mermaid for diagrams, both bundled locally.
- **Resumes:** PDF text extraction happens server-side with a local library.
- **Voice:**
  - Optional voice input through the Web Speech API, behind a feature flag. Text input always works.
  - Show a note that the browser vendor may process speech recognition.
- **Testing:** Vitest for unit tests, Playwright for e2e tests.
- **CI and releases:** GitHub Actions. Images are published to GitHub Container Registry (GHCR).

**Layout**
- `apps/web`
- `services/runner`
- `packages/shared`: Zod schemas, types, and scoring formulas.
- `prompts/`: versioned interviewer, grader, and packet templates, plus `prompts/authoring/` guides for writing content.
- `images/`: Dockerfiles for the language sandboxes.
- `content/`:
  - `dsa`, `cs-fundamentals`, `lld`
  - `ai-fluency/{comprehension,review,extension}`
  - `behavioral`
  - `ml/{system-design,serving,distributed-training,fundamentals,applied}`
  - `companies`, `loops`
- `scripts/`: content tooling.
- `docs/`

## 4. Docker and runtime architecture

**Services in `compose.yaml`**
- `web`: the Next.js app and API, published on `127.0.0.1:${SWEMOCK_PORT:-3000}`.
- `runner`: the code-execution service.
  - No published ports; reachable only on the internal compose network.
  - Requires a shared secret that is generated on first start.
- `ollama`: optional, under the `local-ai` profile.
- **Language sandbox images:**
  - Python and C++ by default.
  - Java and Node are opt-in, through compose profiles or an "Install language" button in Settings that pulls the image.
  - The UI shows which languages are installed and hides the rest.

**Volumes.** A named volume, `swemock-data`, holds SQLite, settings, encrypted keys, and backups.

**Two compose files**
- `compose.yaml` uses prebuilt multi-arch (amd64 + arm64) images from GHCR, pinned to the release version. Users never build anything.
- `compose.dev.yml` builds from source with hot reload, for contributors.

**Startup**
- Healthchecks on both services; `web` waits for `runner`.
- Back up the database, then run migrations automatically.
- Never destroy user data on an upgrade.
- The UI shows runner health.

**Host Ollama**
- On macOS, recommend the native Ollama app, because Docker can't use the Mac GPU.
- The app reaches host Ollama at `host.docker.internal`. Add `extra_hosts: host.docker.internal:host-gateway` so this also works on Linux.
- Document RAM requirements for local models.

**Install:** `git clone <repo> && cd <repo> && docker compose up -d`, then open http://localhost:3000.

**Update:** `git pull && docker compose pull && docker compose up -d`.

## 5. Sandbox and judge

### 5.1 Sandbox design (decide in PLAN.md)
Evaluate two options:
- **A.** The runner talks to the host Docker daemon through a mounted socket and launches a sibling container for each run. This is simple and reliable on Docker Desktop.
- **B.** The runner sandboxes code in-process with nsjail or isolate inside its own container. No socket is needed, but the runner needs elevated capabilities.

Pick one and explain the choice in both DECISIONS.md and SECURITY.md. If you choose A:
- Mount the socket only into `runner`.
- Never publish the runner's ports.
- Authenticate every request from `web`.
- Validate every request: language allowlist and size limits.
- Only ever launch swemock's own sandbox images.

**Required limits for every run**
- No network.
- Read-only root filesystem, with tmpfs for /tmp and /work.
- Non-root user, the default seccomp profile, all capabilities dropped, and no-new-privileges.
- 256MB of memory by default (overridable per problem), 1 CPU, and a pids limit of 64.
- Wall-clock timeouts: 2s per test by default for DSA and 30s per suite for LLD and AI Fluency, with a hard kill.
- stdout and stderr capped at 64KB.
- The container is removed after the run. A warm pool is optional, for latency.

**Toolchains.** Sandboxes have no network, so every image ships its toolchain and test framework preinstalled:
- Python 3.12 with pytest.
- g++ (C++20, -O2) with a vendored single-header test framework.
- Java 21 with a vendored JUnit 5 console launcher.
- Node LTS with TypeScript and node:test.

### 5.2 DSA harness
- The user writes only the function or class, LeetCode-style.
- A per-language driver:
  1. parses JSON test input
  2. calls the user's code
  3. serializes the output
  4. passes it to a checker
- **Checker types:** exact match, unordered list, float tolerance, and custom per-problem checkers.
- **Supported types:**
  - int, long, double, bool, string
  - 1D and 2D arrays
  - linked lists, built from arrays
  - binary trees, in level order with nulls
  - graphs, as edge lists
  - design-class problems, as a sequence of method calls in LeetCode's "LRUCache" input format
- "Run" uses the visible tests plus custom input. "Submit" uses all tests.
- Show runtime and memory for each test, plus a rough efficiency indicator relative to the reference solution.

### 5.3 Project runs (LLD and AI Fluency)
- The multi-file workspace is copied into /work.
- The item's manifest defines its run command and test command.
- Tests emit machine-readable results (JUnit XML or JSON). These are parsed into per-test results with categories: core, edge, extension, regression, and acceptance.
- Users can run only the commands the manifest defines, plus "run current file".

### 5.4 Verdicts
- The possible verdicts are Accepted, Wrong Answer, TLE, MLE, Runtime Error (with trimmed stderr), and Compile Error.
- For a failing visible test, show its input, expected output, and actual output.
- For a failing hidden test, show only "hidden test #k failed" and its category.

## 6. Content system

### 6.1 Storage and sync
- All content lives in `/content` as version-controlled files.
- Each item is a folder containing a YAML manifest plus assets.
- `pnpm content:sync` loads content into SQLite. It also runs automatically on startup when content hashes change.
- Each manifest records:
  - `source`, usually `authored`
  - `reviewed`, a boolean
  - a content `version`
- A Content Review page lists unreviewed items so the maintainer can check and approve them.

### 6.2 Validation
`pnpm content:validate` exits non-zero on any failure. It enforces:

- **Every item:** the manifest passes its Zod schema.
- **DSA:**
  - Python and C++ reference solutions are required. Java and JS/TS need signatures and drivers; their reference solutions are optional.
  - Every reference solution passes all tests within limits.
  - Problems marked `tle_guard: true` ship a brute-force solution, and it must TLE on the large tests.
  - At least 15 hidden tests, including edge and stress cases.
  - Each problem has a test-generator script with a fixed seed. Expected outputs are computed by the reference solution, and the generated files are committed. Validation reruns the generator to confirm the files are reproducible.
- **LLD:**
  - The reference implementation passes the full suite.
  - The stub version imports or compiles and fails the tests, as a sanity check.
- **AI Fluency:**
  - Every planted bug has a test that fails on the buggy code and passes once that bug's fix patch is applied.
  - Manifests list each planted issue's line range, category, severity, and explanation.
  - Manifests also list `acceptable_findings`: real, non-planted issues that shouldn't count against precision.
- **Behavioral, CS fundamentals, and ML:**
  - Every question has key points, and MCQs have exactly one correct option.
  - Every design prompt has a rubric containing must-hit points, strong signals, and red flags.

### 6.3 Content targets (v1.0, reached by M9)

| Content | v1.0 target | Later releases |
| --- | --- | --- |
| DSA problems | 50 (about 25% easy, 55% medium, 20% hard) | |
| CS fundamentals questions | 60 | 150 |
| LLD problems | 12 | 20 |
| AI Fluency: comprehension codebases | 6 | 10 |
| AI Fluency: review PRs | 8 | 15 |
| AI Fluency: feature-extension repos | 4 | 7 |
| Behavioral questions | 40, each with 3–5 authored follow-ups | 80 |
| ML system design prompts | 12 | |
| ML serving prompts | 8 | |
| ML distributed training prompts | 8 | |
| ML applied design prompts | 10 | |
| ML fundamentals questions | 80, mixed MCQ and short answer | 200 |
| Company presets | 6 | |
| Loop presets | 7 | |

### 6.4 Authoring
- You (Claude Code) author all content during development. No API calls are involved.
- Work in batches of about 10 items. Run `content:validate` after each batch, and commit each batch separately.
- Adding content, above all DSA problems, will happen often, so it must be very easy: one scaffold command, one folder per item, no code changes elsewhere, fast single-item validation, and automatic pickup by the running app.
- `pnpm content:new <type> <slug>` scaffolds a new item.
- `prompts/authoring/<type>.md` contains guides that contributors can hand to their own AI tool to draft new items. Every drafted item still has to pass validation.
- **Originality:**
  - All statements, titles, editorials, and codebases are original.
  - Never copy LeetCode or any other platform's statements, editorials, or titles.
  - Classic problem ideas are fine when written in original wording.

## 7. Interviewer engine and grading

### 7.1 Round state machine
- Each round is a sequence of phases with target durations. Example for DSA: intro 2m → clarify 5m → approach 8m → code 25m → test and complexity 5m → candidate questions 5m.
- Timers live server-side, so they survive a page refresh or a container restart.

### 7.2 Interviewer drivers
There are two interchangeable drivers behind one interface.

**ScriptedDriver** (no AI):
- Plays authored content: phase prompts, follow-up questions, timed curveballs, and requirement changes.
- Shows each item at its phase or trigger time.
- The user types or speaks answers in the chat, and everything is logged.
- It does not evaluate answers live.

**LLMDriver** (provider configured). The system prompt is assembled from:
- the round template
- the company/persona preset
- hidden item context
- the current mode

Each turn, the LLMDriver also receives:
- elapsed time and the current phase
- a truncated diff of the user's code since its last turn
- the latest test results

### 7.3 LLM interviewer behavior and leak protection
- Realistic and concise.
- Asks clarifying and follow-up questions, and pushes back on vague claims.
- Asks about complexity, edge cases, and testing.
- Nudges phase transitions naturally ("about 10 minutes left, let's start coding").
- In interview mode it never gives answers. It nudges only when the user is stuck, and logs every nudge.
- Hidden context never leaks:
  - explicit guardrails in the prompt
  - a server-side post-filter that blocks responses reproducing reference solutions or manifests

### 7.4 Logging
Log everything with timestamps:
- chat transcript
- code snapshots every 30s and on every run or submit
- test results and hints
- assistant prompts, responses, and applied hunks
- injected mutations (§8.4)
- annotations and whiteboard snapshots
- phase changes
- packet copies and pasted replies
- self-scores

### 7.5 Scoring
**Score sources.** Every rubric dimension is scored 1–4 and labeled with its source:
- **auto:** objective measurements, such as tests passed, time to first correct submission, hints used, bug recall and precision, decision correctness, and verification behavior from the event log.
- **self:** after the round, the hidden rubric is revealed as a checklist (must-hit points, strong signals, red flags), and the user ticks what they covered.
- **ai:** a connected grader call, or a reply pasted back from a grading packet. Both use the same JSON schema.

**AI grading output** (Zod-validated):
- a score per dimension on a 1–4 scale, with anchored descriptions for each level
- evidence for each score: transcript quotes, timestamps, or code references
- an overall recommendation: Strong No Hire, Lean No Hire, Lean Hire, or Strong Hire
- the top 3 strengths and top 3 improvements
- a "what a strong candidate would have done" section

**Formulas**
- Self-checklist score: the fraction of weighted items covered maps to 1–4 bands.
- Overall recommendation: computed from the available dimension scores, with hard caps. For example, failing the hidden tests in DSA caps the recommendation at Lean No Hire.
- Formulas live in `packages/shared`, are versioned (`formula_version`), documented, and unit-tested.
- The scorecard shows which sources contributed. With no AI score and no self-score, it shows only the objective metrics.

### 7.6 Debrief
- The scorecard, with the source of each score.
- A timeline replay that scrubs through code snapshots, transcript, and whiteboard.
- The reference material: editorial or reference solution, revealed manifests, reference design, and injected mutations along with whether the user caught them.
- A "Copy grading packet" button when no provider is connected.
- "Redo" and "Add to review queue" buttons.

### 7.7 Hint ladder (DSA and LLD, practice mode)
- Hints are authored content. No AI is required.
- Five levels, each behind its own button, that can't be skipped:
  1. a nudging question
  2. the key observation
  3. the approach in words
  4. pseudocode
  5. the full editorial, including common pitfalls and edge cases
- In interview mode, using a hint is logged and lowers the score.

### 7.8 Approach Check (all coding rounds, practice mode)
- The user describes an approach in plain text.
- The response must open with a clear verdict: "Works", "Works but suboptimal (O(...))", or "Doesn't work". One or two lines of why follow. Never any code.
- **Connected:** the `fast` model answers.
- **Provider none:** a copy-prompt packet containing the problem and the user's approach, with the same verdict-format instructions.
- **No AI at all:** the hint ladder serves this purpose.

## 8. Round specs
Every round below works with provider `none`. Each one's "Without AI" section describes its fallback.

### 8.1 Recruiter Screen (20–30 min)
**Setup**
- A textarea to paste a resume, plus optional PDF upload that is extracted to text server-side.
- An optional job description paste box.
- Target role: SWE intern, new grad SWE, MLE, quant developer, or other (free text).
- An optional target company.
- Saved resume versions that can be reused across sessions.

**Phase 1, resume (about 10 min)**
- "Tell me about yourself."
- Deep dives on 2–3 resume items a real recruiter would probe: vague bullets, impressive metrics, buzzwords.
- "Why this company and role?" and logistics: graduation date, location, timeline.
- With AI: 5–10 resume-specific questions, e.g. "You wrote 'improved latency 40%' — how did you measure that?"

**Phase 2, CS fundamentals (about 15 min).** Rapid-fire questions with adaptive difficulty, drawn from the CS fundamentals bank. Each question has model-answer key points. Topics:
- Data structures and Big-O of common operations; hash map internals; heaps; BST vs hash table.
- OOP: encapsulation, polymorphism, inheritance vs composition, SOLID, interfaces vs abstract classes.
- Operating systems: process vs thread, context switching, virtual memory and paging, deadlock conditions, mutex vs semaphore, scheduling.
- Concurrency: race conditions, atomics, locks.
- Networking: TCP vs UDP, the handshake, what happens when you type a URL, HTTP methods and status codes, TLS, DNS, REST vs gRPC, WebSockets.
- Databases: SQL vs NoSQL, indexes and B-trees, ACID, isolation levels, normalization, joins, replication and sharding basics, CAP.
- Memory: stack vs heap, garbage collection, leaks.
- C++: RAII, smart pointers, virtual functions, move semantics, const.
- Python: GIL, mutability, generators, decorators.
- Java: JVM, equals/hashCode.
- Also: caching, load balancing, git, testing, security basics (SQL injection, XSS, hashing vs encryption), compiled vs interpreted languages.

**Rubric:** communication, resume ownership and depth, motivation, fundamentals accuracy, and red flags (overclaiming, or being unable to explain one's own project).

**Resume feedback panel.** Lists the bullets that drew hard follow-ups or that the user couldn't back up, with suggested rewrites. Available with AI or through a packet.

**Without AI**
- The resume is parsed deterministically into sections and bullets.
- The ScriptedDriver deep-dives on the 2–3 bullets that contain numbers, percentages, or strong claims ("Tell me more about: …"), then moves to generic recruiter questions.
- Fundamentals questions come from the bank. After each answer, the key points are revealed and the user self-grades.
- Packets available:
  - a live packet that runs the full recruiter screen in claude.ai, with the resume included
  - a grading packet
  - a resume-feedback packet

### 8.2 DSA
**Each problem includes**
- a markdown statement with KaTeX, constraints, and examples
- 3–5 visible tests and at least 15 hidden tests (edge and large)
- signatures for each language, plus a checker type
- tags, difficulty, and optional company tags
- a 5-level hint ladder
- an editorial covering intuition, approach, complexity, and common pitfalls and edge cases
- reference solutions
- authored interviewer follow-ups, e.g. "what if the input is a stream?" or "what if memory is O(1)?"

**Topics**
- arrays and hashing, two pointers, sliding window, prefix sums
- stack and monotonic stack
- binary search, including binary search on the answer
- linked lists, trees, tries, heaps
- intervals, greedy, backtracking
- graphs: BFS/DFS, topological sort, union-find, Dijkstra, MST
- DP: 1D, 2D, knapsack, LIS, interval, bitmask
- bit manipulation, math, string algorithms
- design problems
- a few segment tree and Fenwick tree hards

**UI**
- LeetCode-like split panes: statement | editor | console.
- A language switcher with saved drafts per language.
- Custom input, Run and Submit, and a verdict panel.
- In interview mode, an interviewer chat drawer and a timer.

**Problem browser**
- Filters for tag, difficulty, status, and company.
- A constrained random picker, e.g. "random unsolved medium graph problem".

**OA mode**
- 2 problems in 70–90 minutes.
- No interviewer.
- HackerRank-style partial credit by the share of tests passed.

**Spaced repetition.** Problems the user failed or needed hints on come back after 1, 3, 7, and 14 days.

**Interview rubric:** understanding and clarification, algorithm quality, correctness, code quality, complexity analysis, testing and edge cases, communication.

**Without AI**
- The ScriptedDriver runs the phases. It asks the user to write clarifying questions, approach, and complexity in the chat before coding.
- After an accepted submission, it asks the authored follow-ups.
- Scoring:
  - auto: correctness, time, hints, runs before first accept
  - self: the rubric checklist
- An optional grading packet.

### 8.3 Low-Level Design
Both formats run against hidden unit tests in the judge.

**Format A, "Complete the system"**
- File 1 is 100–200 lines of provided code: models, utilities, and interfaces the system depends on. It is editable, but edits to it are tracked and flagged.
- File 2 is either method stubs with docstrings, or completely empty with only a README. The README describes the required behavior and the public API the tests call.
- The user implements file 2 so the program works.

**Format B, "Implement the class"**
- A single file containing a class skeleton and method stubs.
- A spec describes the class's overall responsibility and each method's contract: inputs, outputs, errors, expected complexity, and thread-safety when relevant.

**Problems.** Split across both formats. Each is available in Python and at least one compiled language:
- parking lot; LRU and LFU caches
- rate limiter (token bucket and sliding window)
- key-value store with BEGIN/ROLLBACK/COMMIT
- in-memory file system; elevator controller
- vending machine (state pattern); library system; splitwise
- meeting room or hotel booking
- tic-tac-toe or snakes and ladders with pluggable rules
- pub/sub broker; task scheduler with priorities and dependencies
- logger with levels and sinks; bank with transfers and an audit log
- limit order book matching engine; URL shortener; trie autocomplete
- observer-based notification system; job queue with retries

**Requirement change (interview mode)**
- At about 60% of the time, the interviewer introduces an authored requirement change, e.g. "now support VIP spots".
- An extra set of hidden extension tests unlocks.
- The ScriptedDriver handles this too.

**Tests**
- Visible tests can be run any time.
- On submit, show pass counts by category: core, edge, and extension.

**Grading**
- Tests passed (auto).
- A design review covering:
  - separation of concerns
  - appropriate patterns without over-engineering
  - naming and encapsulation
  - error handling and extensibility
  - complexity of key operations
  - consistency with file 1's conventions
- The design review is done by AI when connected, or by the self-checklist plus an optional grading packet.

**Debrief:** the reference implementation, design notes, and a Mermaid class diagram.

### 8.4 AI Fluency

**Shared workspace** (CoderPad-like)
- A file tree, Monaco tabs, and a run panel limited to the manifest's commands.
- An AI Assistant side panel where the user attaches files or selections through "add to context":
  - **Connected:** the `assistant` model answers in-panel.
  - **Provider none:** "Ask AI" composes a packet from the user's question and the attached files. The user copies it to any assistant (claude.ai, Claude Code, an IDE assistant) and pastes the reply back.
- Either way:
  - Every prompt, attached context, reply, and applied hunk is logged.
  - Code blocks are extracted from replies and applied through a diff preview with per-hunk accept or reject.
- In interview mode, a separate interviewer chat, either scripted or LLM.

**Fallible mode** (off by default)
- About 20% of code-producing assistant replies, whether in-app or pasted back, get one deterministic mutation before the diff preview.
- Mutation operators:
  - off-by-one in a loop bound or slice
  - flipped comparison
  - removed null or empty check
  - swapped arguments
  - changed default value
  - dropped close or await
- Mutated code must stay syntactically valid; verify it with a quick parse or compile in the sandbox.
- Each mutation is logged as hidden and revealed in the debrief, along with whether the user caught it: rejected that hunk, or fixed those lines before the round ended.
- This works with every provider, including `none`.

#### 8.4.1 Code comprehension (60 min, modeled on publicly reported 2026 AI-assisted formats)
**Codebases.** 200–500 unfamiliar lines across 1–5 files, in Python, Java, C++, or TypeScript. Example domains:
- rate-limited service, inventory system, CSV ETL pipeline
- HTTP cache, event scheduler, tiny interpreter
- matching engine, session/auth manager, route planner, pagination API

**Hidden manifest for each codebase**
- 4–8 planted bugs of varying subtlety, for example:
  - off-by-one errors and boundary bugs
  - mutable default arguments and race conditions
  - overflow, stale cache invalidation, and resource leaks
  - swallowed errors, timezone or float mistakes
  - an accidental O(n²) hot path
- 2–4 debatable design decisions, each with arguments both ways.
- 3–5 improvement opportunities.
- `acceptable_findings`: real issues that weren't planted.

**User's tasks**
1. Summarize what the system does.
2. Find bugs using line-anchored gutter annotations with category and severity. Optionally prove a bug with a test and run it.
3. Discuss the design decisions.
4. Propose improvements, and optionally implement one.

**Phases:** orientation 5m → bug hunt 30m → design discussion 15m → improvements and wrap-up 10m.
- Interviewer prompts include "walk me through this function", "why might the author have done X?", and "what breaks at 100x scale?"
- The ScriptedDriver asks the authored design questions from the manifest.

**Auto-matching annotations**
- An annotation matches a planted bug when its line range overlaps the bug's (±2 lines) and the category matches.
- In the debrief, the user confirms or rejects borderline matches.
- An annotation that matches an acceptable finding doesn't count against precision.

**Grading**
- auto: bug recall and precision, and severity calibration.
- AI or self: summary accuracy and depth of design reasoning.
- auto plus AI or self: quality of AI use — assistant queries, and claims verified by running code.
- AI or self: communication.

#### 8.4.2 AI-generated code review (30–45 min)
**PR view.** A GitHub-style pull request "written by an AI agent":
- title and description
- unified or split diff across 1–4 files, with full-file view
- inline comments on diff lines
- a final decision (Approve, Request changes, or Reject) with a summary comment
- a "Fix it" option that opens the branch in the editor with tests runnable

**Seeded issue types**
- correctness bugs
- missed edge cases: empty input, null, unicode, huge input, concurrency
- security issues:
  - SQL injection, path traversal, hard-coded secrets
  - unsafe deserialization, missing authorization checks
  - SSRF, ReDoS, insecure randomness
- performance problems
- hollow tests: no real asserts, or mocked-away logic
- hallucinated APIs, unrelated scope creep, and descriptions that don't match the diff

Some PRs must be essentially correct, so the right answer is "approve with nits". This penalizes over-flagging.

**Grading**
- auto:
  - whether the final decision is correct
  - severity-weighted recall and precision, using the same line matching as §8.4.1
  - whether fixes pass the tests
- AI or self: comment quality — specific, actionable, professional.

#### 8.4.3 Feature extension in an existing repo (45–60 min)
**Repos.** 8–20 files and 500–2000 lines, with an existing test suite and clear conventions: layering, naming, error handling, logging. Each repo also has:
- a `CONVENTIONS.md` that is used for grading
- a product ticket with acceptance criteria

Examples:
- todo API: add tags and filtering
- CLI expense tracker: add recurring expenses and budget alerts
- chess engine: add castling and en passant
- booking service: add a waitlist
- static site generator: add tag pages
- job queue: add exponential backoff and a dead-letter queue
- API client: add a caching layer

The user is expected to use the AI assistant.

**Grading**
- auto:
  - hidden acceptance tests pass, with no regressions
  - verification behavior from the event log: tests run after applying assistant code, time spent in diff review, hunks rejected, tests added, mutations caught
  - time management
- AI or self:
  - structural fit: follows existing patterns, no duplication, sensible placement. Judged against a reference implementation and CONVENTIONS.md.
  - prompting quality: clear specs, relevant context, task decomposition, iteration
- The grading packet includes the full assistant log.

### 8.5 Behavioral (30–45 min)
**Question bank.** Tagged by competency, and each question has 3–5 authored follow-ups:
- tell me about yourself; most challenging project
- conflict with a teammate; disagreement with a manager or tech lead
- failure or mistake; a time you were wrong
- tight deadline; ambiguity; ownership and initiative
- leading without authority; receiving and giving critical feedback
- prioritization; learning a technology quickly; customer impact
- deciding with incomplete data; simplifying something complex
- helping a teammate; scope change; a technical tradeoff
- why this company; questions for the interviewer

Optional company lenses map questions to Amazon Leadership Principles, Google's Googleyness, and a Meta-style lens.

**Story bank**
- The user writes STAR stories: situation, task, action, result, metrics, reflection, and competency tags.
- A coverage matrix (competency × story) flags gaps and over-reliance on any single story.

**Mock flow**
- 4–6 questions, each with 1–3 probing follow-ups:
  - "what did YOU specifically do?"
  - "what was the measurable result?"
  - "how did the other person react?"
  - "what would you do differently?"
- Each answer gets a 2–3 minute soft timer with a visual indicator.
- With voice on, show filler-word count and words per minute.

**Grading per answer:** STAR structure, specificity, ownership ("I" vs "we"), impact and metrics, reflection, relevance, and concision.
- auto signals: duration, word count, I/we ratio, whether the answer contains a number or metric, and filler words when voice is on.

**Stronger-version rewrite**
- For each answer, write a stronger version using only facts the user actually gave. Never fabricate.
- List the missing facts the user should add.
- Done with AI, or through a packet.

**Without AI**
- The ScriptedDriver asks authored questions and follow-ups.
- Scoring: auto signals plus the self-checklist.
- A grading-and-rewrite packet.

### 8.6 ML rounds

**Design workspace** (shared by all ML design rounds)
- **Left:** the prompt and the interviewer chat.
- **Center:** an Excalidraw whiteboard. Each turn, its elements, labels, and arrows are exported as a text graph for the interviewer.
- **Right:** a structured notes panel with collapsible sections templated per round type. Using it is optional.

**Curveballs.** The interviewer injects scale numbers and curveballs mid-round, e.g. "10x traffic on weekends", "a GPU node died mid-run", or "labels arrive 30 days late". These are authored per item with trigger times, so the ScriptedDriver can deliver them too.

**Rubrics and debrief**
- Each ML item has a hidden rubric with must-hit points, strong signals, and red flags.
- Scored dimensions: coverage, depth, tradeoff reasoning, quantitative estimation, and communication. Scored by AI, or by self-checklist plus a packet.
- The debrief includes a reference design: a Mermaid diagram plus a writeup.

#### 8.6.1 ML system design (45–60 min)
**Prompts:** feed ranking, video recommendations, ads CTR prediction, search ranking, payment fraud, spam/abuse detection, ETA prediction, people-you-may-know, notification send-time optimization, content moderation, query autocomplete, dynamic pricing, RAG support assistant.

**Rubric coverage**
- problem framing and business metrics; requirements and scale estimates
- data ingestion, batch vs streaming; labeling
- features and feature store: online/offline consistency, point-in-time correctness, training-serving skew
- model choice and training pipeline
- offline evaluation and A/B testing
- serving architecture
- monitoring: data and concept drift, performance, alerting, feedback loops
- retraining cadence, privacy and fairness, fallbacks, tradeoffs

#### 8.6.2 Inference and serving design
**Prompts**
- LLM chat endpoint at 7B and 70B scale with a p99 target
- real-time ranking at 50k QPS within 100ms
- image moderation at scale; embedding service
- on-device vs server inference; multi-model serving platform

**Topics**
- latency budget breakdown
- dynamic and continuous batching; KV cache
- caching: features, results, embeddings
- quantization (INT8, INT4, FP8), distillation, and pruning, with accuracy tradeoffs
- speculative decoding; CPU vs GPU
- GPU autoscaling: queue depth vs utilization signals, cold starts, warm pools
- load balancing; model versioning; canary and shadow deploys
- tail latency; cost per 1k requests; observability

#### 8.6.3 Distributed training
**Prompts:** train a 70B LLM on 1024 GPUs, scale a recommender with huge embedding tables, survive failures in a multi-week run, cut training time 4x.

**Topics**
- data parallelism: DDP, all-reduce, gradient accumulation
- ZeRO/FSDP sharding
- tensor, pipeline, sequence, and expert parallelism (bubbles, micro-batches, 1F1B)
- mixed precision; activation checkpointing
- interconnects: NVLink vs InfiniBand
- checkpointing: frequency, async, sharded
- failure detection and elastic recovery; stragglers
- data loader throughput; reproducibility; loss spikes
- back-of-envelope compute estimates (FLOPs ≈ 6·N·D)

#### 8.6.4 ML fundamentals
**Two sub-modes**
- **(a) Oral rapid-fire**, with adaptive difficulty and "why?" / "when does that fail?" follow-ups.
  - Without AI: timed flashcards. The user answers by speaking or typing, then the key points are revealed for self-grading.
- **(b) Quiz** with MCQ and short-answer questions, plus spaced repetition.
  - MCQs are auto-graded.
  - Short answers are graded by AI, or self-graded against key points.

**Bank topics**
- bias-variance; over- and underfitting
- regularization: L1/L2, dropout, early stopping, augmentation
- losses: MSE, MAE, Huber, cross-entropy, hinge, focal, contrastive, ranking losses
- optimizers and learning-rate schedules; vanishing and exploding gradients; batch norm vs layer norm
- metrics: precision/recall/F1, ROC-AUC vs PR-AUC, calibration, log loss, NDCG/MAP/MRR, RMSE
- choosing metrics for imbalanced data; cross-validation and leakage; class imbalance
- trees vs linear models vs neural nets; bagging and boosting
- k-means and PCA; embeddings; transformer basics
- probability and statistics: Bayes, MLE vs MAP, hypothesis tests, p-values, A/B testing pitfalls

#### 8.6.5 Applied ML design (45 min)
**Prompts:** marketplace search ranking, home-feed recommender, "also bought", job matching, notification relevance, news personalization, playlist continuation, cold start.

**Rubric emphasis**
- label definition: implicit vs explicit feedback, negative sampling, delayed labels, position bias
- candidate generation vs ranking stages
- features: user, item, context, and crosses
- model progression: heuristic → GBDT or logistic → two-tower → deep ranker
- pointwise, pairwise, and listwise losses
- offline evaluation: NDCG@k, recall@k, calibration, slicing
- online evaluation: A/B tests, guardrail metrics, novelty effects, interleaving
- exploration and bandits; feedback loops; iteration plan

## 9. Mock loops and company presets
**Loop builder.** An ordered list of rounds with durations and optional breaks.

**Loop presets** (in `content/loops/`):
- Big Tech SWE Intern: recruiter, DSA, DSA, behavioral.
- Google-style SWE: DSA, DSA, AI Fluency comprehension, Googleyness behavioral.
- Meta-style: 2 DSA rounds with 2 problems each in 45 min, then behavioral.
- Startup SWE: LLD, feature extension, behavioral.
- MLE: DSA, ML fundamentals, ML system design, applied ML, behavioral.
- ML Infra: DSA, serving, distributed training, behavioral.
- OA Only.

**Company presets** (in `content/companies/*.yaml`)
- Each sets persona style, question weighting, and rubric emphasis.
- They are clearly labeled unofficial approximations and use no company logos.

**Hiring-committee packet** (end of loop)
- All scorecards and an overall summary.
- Weaknesses that recur across rounds.
- The summary is deterministic. An AI-written narrative is added when a provider is connected, or through a packet.

## 10. Dashboard and progress
- **Home:**
  - streak
  - spaced-repetition reviews that are due
  - a recommended next session based on the weakest dimensions and tags (deterministic)
- **Analytics:**
  - score trends per round type and rubric dimension
  - DSA by tag: solve rate, average time, hints used
  - AI Fluency recall, precision, and mutations caught
  - behavioral competency coverage
- **History:** every session with full replay.
- **Export:** JSON export and import of all data, and markdown export of any debrief.

## 11. Data model (minimum; refine in PLAN.md)
- **settings:** provider config, model roles, feature flags.
- **secrets:** encrypted API keys.
- **users:** one default user per install, but keep `user_id` columns.
- **resumes:** versioned.
- **content_items:** type, slug, version, manifest JSON, source, reviewed, content hash.
- **sessions:** round type, item, mode, driver (scripted | llm), provider, loop_id, timestamps, status.
- **events:** session_id, ts, kind, payload JSON. Kinds:
  - chat, code_snapshot, run, submit, hint, approach_check
  - assistant_prompt, assistant_response, assistant_apply, mutation_injected
  - annotation, whiteboard_snapshot, phase_change
  - packet_copied, reply_pasted, self_score
- **submissions**
- **scorecards:** per-dimension scores with their source, recommendation, model or "pasted" or "self", prompt_version, formula_version.
- **stories**, **srs_cards**, **loops**, **loop_rounds**
- **token_usage**

Version every prompt and packet template so grading can be compared across versions.

## 12. Non-functional requirements
- **Performance:**
  - The editor feels snappy.
  - A typical DSA submit returns a verdict in a few seconds after warmup.
  - First interviewer token arrives in under 2s with hosted providers. Local models depend on the user's hardware.
- **Robustness:**
  - Autosave every 5s.
  - Sessions resume after a page refresh or a container restart.
  - On model errors: retry with backoff, show a banner, and offer to switch that step to copy-prompt.
  - Never lose the user's work.
- **Offline:**
  - Once images are pulled, everything works without internet when the provider is `none` or `ollama`.
  - Nothing loads from a CDN at runtime. Fonts, Monaco, Excalidraw, KaTeX, and Mermaid are all bundled.
- **Privacy:**
  - No telemetry, analytics, or update pings.
  - Data leaves the machine only when the user configures a hosted provider or copies a packet themselves.
- **Cost (hosted providers only):**
  - The `fast` role handles short replies; `grader` is used only for final grading.
  - Use prompt caching for large static context where supported.
  - Show token usage per session, with a configurable per-session cap.
- **UX:**
  - Shortcuts: Cmd/Ctrl+Enter runs, Cmd/Ctrl+Shift+Enter submits, Cmd/Ctrl+K opens the command palette.
  - Dark mode by default, with a light toggle.
  - Keyboard accessible, and respects reduced-motion settings.
- **Hidden content:**
  - Reference solutions, hidden tests, manifests, and rubrics are never sent to the browser before the debrief.
  - Grading packets are generated only after the round ends.
  - An automated test inspects every API response and page payload during a session to verify this.

## 13. Public repo, CI, and releases

**README**
- what swemock is, with screenshots or a GIF
- requirements: Docker and git
- quickstart
- AI setup options (none, Ollama, OpenAI-compatible, Anthropic), including what each costs: free, free, varies, and pay-per-use on the user's own key
- how to update
- troubleshooting: Docker not running, port in use, Apple Silicon, WSL2, Ollama connection
- how to add content
- FAQ

**Repo files**
- `LICENSE` (MIT)
- `CONTRIBUTING.md`: dev setup, adding content, running `content:validate`
- `SECURITY.md`: sandbox design and threat model
- `CHANGELOG.md`
- issue and PR templates
- `.gitattributes` with LF line endings
- `.gitignore`, covering `.env` and local data
- `.env.example` with placeholder values only
- `docs/` for deeper documentation

**Content rules for the public repo**
- All content is original (§6.4).
- Company presets are unofficial and use no logos.

**CI** (GitHub Actions, on every PR and push to main)
- typecheck, lint, and unit tests
- `content:validate`
- sandbox containment tests
- e2e smoke test:
  - `docker compose up` on a clean Ubuntu runner
  - complete one DSA submission with provider `none`
  - the `web` container's internet access is blocked, to prove there are no outbound calls

**Releases**
- On a `vX.Y.Z` tag:
  - build multi-arch images (amd64 + arm64) with buildx
  - push them to GHCR
  - update the pinned version in `compose.yaml`
  - publish a GitHub Release with changelog notes
- Semantic versioning.

## 14. Milestones (in order; each one shippable)
- **M0, Scaffold and distribution skeleton:**
  - monorepo and Next.js app shell with navigation
  - DB with startup backup and migrations
  - Settings page with provider `none`
  - `compose.yaml` and `compose.dev.yml`, the named volume, and 127.0.0.1 binding
  - CI skeleton
  - CLAUDE.md, `.gitignore`, `.gitattributes`, `.env.example`, LICENSE
- **M1, Judge:**
  - sandbox decision (§5.1)
  - runner service with Python and C++ images, then Java and Node
  - DSA harness and checkers
  - project-run support
  - containment tests for an infinite loop, a fork bomb, a memory hog, a network attempt, and a file write outside /work. All must be contained.
- **M2, DSA practice (no AI):**
  - content schema and validation, plus 15 problems working end to end
  - problem browser, editor UI, Run and Submit
  - hint ladder and editorial
  - OA mode and spaced repetition
- **M3, AI layer and interviewer engine:**
  - providers (none, ollama, openai-compatible, anthropic) plus the FakeProvider
  - first-run setup and encrypted key storage
  - packets and paste-back parsing
  - ScriptedDriver and LLMDriver, plus the leak post-filter
  - scoring (auto, self, ai), debrief, and replay
  - DSA interview mode and Approach Check
  - the hidden-content test
- **M4, Recruiter Screen and Behavioral:**
  - resume handling, story bank, coverage matrix
  - the voice flag
  - CS fundamentals and behavioral seeds
- **M5, LLD:** both formats, the requirement-change mechanic, and 8 problems.
- **M6, AI Fluency:**
  - workspace and assistant panel in both modes
  - diff-apply and logging
  - mutation-based Fallible mode
  - all three sub-formats, with 4 items each
- **M7, ML rounds:**
  - whiteboard workspace and notes templates
  - all five sub-types, with 3 items per design type
  - fundamentals quiz and flashcards with spaced repetition
- **M8, Loops and analytics:**
  - mock loops and presets, company presets
  - hiring-committee packet
  - dashboard and analytics
  - export and import
- **M9, Content and polish:**
  - reach every target in §6.3, in validated batches
  - polish
  - e2e tests for every round type in both modes, run with both provider `none` and the FakeProvider
- **M10, Public release:**
  - release workflow with multi-arch GHCR images
  - README, docs, and the repo files from §13
  - a fresh-machine install that follows only the README
  - tag v1.0.0

Keep `docker compose up` working from M0 onward.

## 15. Definition of done
- **Install:** on a clean machine with only Docker and git, `git clone` followed by `docker compose up -d` serves the app at http://localhost:3000. No API key is needed.
- **Provider `none`:** every round type can be completed in both modes and produces a scorecard.
- **Connected provider:** with Ollama or a user's own key, the live interviewer, assistant, and AI grading all work.
- **Content:** every target in §6.3 is met and passes `content:validate`.
- **Tests:**
  - all unit, e2e, sandbox, and hidden-content tests pass
  - CI is green
  - the no-outbound-network smoke test passes
- **Release:** the v1.0.0 release is published with GHCR images, and the README quickstart works exactly as written.
