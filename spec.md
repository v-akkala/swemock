# Build "swemock": a personal, local-first technical interview practice platform

## 0. How to work
- You are starting from an empty repo. Before writing any code, write PLAN.md (architecture, data model, directory layout, milestone breakdown, risks) and wait for me to say "go". After that, work through the milestones without asking me questions unless you are truly blocked. Pick sensible defaults and record them in DECISIONS.md.
- Maintain CLAUDE.md with how to run, test, and add content, plus an architecture summary and conventions. Keep it current.
- After each milestone:
  - Run typecheck, lint, unit tests, content validation, and the relevant Playwright e2e tests, and fix any failures.
  - Update PROGRESS.md with what's done, what's next, and known issues.
  - Make a git commit with a descriptive message.
- Never hard-code secrets. Don't ship half-built features with TODO stubs; anything you cut goes in PROGRESS.md.
- Prefer boring, well-supported libraries. Pin versions.

## 1. Product overview
This is a single-user web app (for me) that runs locally with `docker compose up`, plus `pnpm dev` for development. It simulates real SWE and MLE interview rounds using:
- an AI interviewer
- a real sandboxed code-execution judge
- strict timers
- rubric-based scorecards with evidence

Round types:
1. Recruiter Screen: resume walkthrough plus CS fundamentals.
2. DSA: LeetCode-style problem solving.
3. Low-Level Design (LLD): two formats.
4. AI Fluency: three sub-formats (code comprehension, AI-generated code review, feature extension).
5. Behavioral.
6. ML rounds: ML system design, inference and serving design, distributed training, ML fundamentals, applied ML design.

Every round supports two modes:
- **Practice mode:** soft or no timer, hint ladder available, editorial and solution available after submitting or giving up.
- **Interview mode:** strict timer, interviewer persona, no editorial until the debrief, hints are logged and lower the score (like real interviewer nudges), full scorecard at the end.

**Mock Loops** chain several rounds into one loop (presets plus custom) and end with a combined "hiring committee packet".

## 2. Tech stack
Use this stack unless you have a strong reason not to; log any deviation in DECISIONS.md.
- Next.js (App Router), TypeScript in strict mode, Tailwind, shadcn/ui.
- Monaco editor (@monaco-editor/react) with multi-file tabs and a file tree.
- SQLite through Drizzle ORM, stored at ./data/swemock.db, with migrations checked in.
- Zod for every API input and every structured LLM output.
- LLM access through an `LLMProvider` interface:
  - Anthropic TypeScript SDK as the default implementation.
  - Optional Gemini and OpenAI adapters, so the AI Fluency assistant can mimic Google's Gemini-assisted format.
  - Model IDs come from env vars: INTERVIEWER_MODEL, ASSISTANT_MODEL, GRADER_MODEL, FAST_MODEL. Look up current model IDs in the provider docs when you write the client.
  - All LLM calls run server-side and stream to the UI over SSE.
- A separate `runner` service (Node or Go, your choice) that executes code in throwaway Docker containers.
  - Languages: Python 3.12, C++20 (g++ -O2), Java 21, JavaScript/TypeScript (Node).
  - Python and C++ come first.
- Embedded Excalidraw for design-round whiteboards; persist the scene JSON.
- Optional voice input through the Web Speech API, behind a feature flag. Text input must always work.
- Vitest for unit tests, Playwright for e2e tests.
- docker-compose with `web` and `runner` services, plus a .env.example.

Suggested layout:
- apps/web
- services/runner
- packages/shared: Zod schemas and types.
- prompts/: versioned prompt templates.
- content/
  - dsa
  - lld
  - ai-fluency/{comprehension,review,extension}
  - recruiter
  - behavioral
  - ml/{system-design,serving,distributed-training,fundamentals,applied}
  - companies
  - loops

## 3. Sandbox and judge
**Container limits.** Every run gets a fresh container with:
- `--network none`
- a read-only root filesystem, with tmpfs for /tmp and /work
- a non-root user
- the default seccomp profile
- 256MB of memory by default (overridable per problem), 1 CPU, and a pids limit of 64
- a wall-clock timeout: 2s per test by default for DSA, 30s per suite for LLD and AI Fluency
- stdout and stderr capped at 64KB, and a hard kill on timeout

Pre-build one image per language. Keep a warm container pool if latency needs it. The runner must only be reachable on the internal docker network or localhost.

**Verdicts.** Accepted, Wrong Answer, TLE, MLE, Runtime Error (with trimmed stderr), Compile Error.
- For a failing visible test, show its input, expected output, and actual output.
- For a failing hidden test, show only "hidden test #k failed" and its category (edge, large, and so on).

**DSA harness.**
- I write only the function or class, LeetCode-style. A per-language driver parses JSON test input, calls my code, serializes the output, and passes it to a checker.
- Checker types: exact match, unordered list, float tolerance, and custom per-problem checkers.
- Supported types:
  - int, long, double, bool, string
  - 1D and 2D arrays
  - linked lists (from arrays)
  - binary trees (level-order with nulls)
  - graphs (edge lists)
  - design-class problems as a sequence of method calls (LeetCode's "LRUCache" input format)
- "Run" uses the visible tests plus custom input. "Submit" uses all tests.
- Show runtime and memory per test, plus a rough efficiency indicator relative to the reference solution.

## 4. Content system
All content lives in /content as version-controlled files. Each item is a folder with a YAML manifest plus assets. `pnpm content:sync` loads it into SQLite.

`pnpm content:validate` must enforce all of the following:
- **DSA:**
  - Every reference solution (at least Python and C++) passes all tests within limits.
  - Problems marked `tle_guard: true` also ship a brute-force solution that must TLE on the large tests.
  - Each problem has at least 15 tests, including edge and stress cases.
- **LLD:** The reference implementation passes the full suite. The stub version imports or compiles and fails the tests, as a sanity check.
- **AI Fluency:**
  - Every planted bug has a test that fails on the buggy code and passes once its fix patch is applied.
  - The manifest lists each planted issue's line range, category, severity, and explanation.
- Every manifest validates against its Zod schema, and validation exits non-zero on any invalid item.

Authoring tools:
- `pnpm content:new <type> <slug>` scaffolds a new item.
- `pnpm content:generate <type> [--topic ...]` uses the LLM to draft a full item (statement, tests, reference solution, planted bugs, rubric). It runs validation and keeps only passing items. Kept items go to content/drafts/ with `source: generated` so I can review them before promoting.
- Write all problem statements in original wording. Never copy LeetCode or other platforms' statements verbatim.

## 5. Shared AI interviewer engine
Build one reusable engine that every conversational round uses.

**Rounds as phase state machines.** Each round is a sequence of phases with target durations. Example for DSA: intro 2m → clarify 5m → approach 8m → code 25m → test and complexity 5m → my questions 5m.
- Each turn, the interviewer receives the elapsed time and the current phase, and nudges transitions naturally.
- Timers live server-side so they survive a page refresh.

**System prompt assembly.** The interviewer's system prompt is built from:
- a round-type template
- a company/persona preset
- hidden item context (problem, rubric, planted-bug manifest, reference design)
- the current mode

Hidden context must never leak. Use explicit prompt guardrails plus a server-side post-filter that blocks responses reproducing reference solutions or manifests.

**Interviewer behavior.**
- Realistic and concise.
- Asks clarifying and follow-up questions, and pushes back on vague claims.
- Asks about complexity, edge cases, and testing.
- In interview mode, never gives answers; nudges only when I'm stuck, and logs every nudge.

**Live context.** The interviewer sees a truncated diff of my code since its last turn and my latest test results.

**Logging.** Log everything with timestamps:
- chat transcript
- code snapshots every 30s and on every run or submit
- test results
- hints used
- AI-assistant prompts and responses
- annotations
- whiteboard snapshots
- phase changes

**Grading.** After a round ends, a separate grader call (GRADER_MODEL, temperature 0) receives the full log and the rubric and returns Zod-validated JSON containing:
- a score per rubric dimension on a 1–4 scale, with anchored descriptions for each level
- evidence for each score, as transcript quotes, timestamps, or code references
- an overall recommendation: Strong No Hire, Lean No Hire, Lean Hire, or Strong Hire
- the top 3 strengths and top 3 improvements
- a "what a strong candidate would have done" section

Blend the LLM scores with objective signals: tests passed, time to first correct submission, hints used, and bug recall/precision.

**Debrief screen.**
- the scorecard
- a timeline replay that scrubs through code snapshots, transcript, and whiteboard
- the editorial or reference solution, the revealed manifests, and the reference design
- a "Redo" button and an "Add to review queue" button

**Approach Check** (all coding rounds, practice mode). I describe my approach in plain text. The response must open with a clear verdict: "Works", "Works but suboptimal (O(...))", or "Doesn't work". After that comes one or two lines of why, and never any code.

**Hint ladder** (DSA and LLD, practice mode). Five levels, each behind its own button, that cannot be skipped:
1. A nudging question.
2. The key observation.
3. The approach in words.
4. Pseudocode.
5. The full editorial, including common pitfalls and edge cases.

## 6. Round specs

### 6.1 Recruiter Screen (20–30 min)
**Setup:**
- A textarea to paste my resume, plus optional PDF upload extracted to text server-side.
- An optional job description paste box.
- Target role: SWE intern, new grad SWE, MLE, or quant dev.
- An optional target company.
- Saved resume versions I can reuse across sessions.

**Phase 1, resume (about 10 min):**
- "Tell me about yourself."
- Deep dives on the 2–3 resume items a real recruiter would probe: vague bullets, impressive metrics, buzzwords.
- "Why this company and role?" and logistics (graduation date, location, timeline).
- The AI also generates 5–10 resume-specific questions, e.g. "You wrote 'improved latency 40%' — how did you measure that?"

**Phase 2, CS fundamentals (about 15 min):** rapid-fire questions with adaptive difficulty, drawn from a seed bank of at least 150 questions. Each question has model answer key points. Topics:
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

**Rubric:** communication, resume ownership and depth, motivation, fundamentals accuracy, and red flags (overclaiming, or being unable to explain my own project).

**Extra output:** a "Resume feedback" panel listing the bullets that drew hard follow-ups or that I couldn't back up, with suggested rewrites.

### 6.2 DSA
**Problem bank.** Seed at least 75 problems, about 25% easy, 55% medium, and 20% hard. Topics:
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

**Each problem includes:**
- a markdown statement with KaTeX, constraints, and examples
- 3–5 visible tests and at least 15 hidden tests (edge and large)
- signatures for each language, plus a checker type
- tags, difficulty, and optional company tags
- a 5-level hint ladder
- an editorial covering intuition, approach, complexity, and common pitfalls and edge cases
- reference solutions for each language
- interviewer follow-ups, e.g. "what if the input is a stream?" or "what if memory is O(1)?"

**UI:**
- LeetCode-like split panes: statement | editor | console.
- A language switcher with saved drafts per language.
- Custom input, Run and Submit, and a verdict panel.
- An interviewer chat drawer in interview mode, and a timer.

**Problem browser:**
- Filters for tag, difficulty, status, and company.
- A constrained random picker, e.g. "random unsolved medium graph problem".

**OA mode:** 2 problems in 70–90 minutes, no interviewer, HackerRank-style partial credit by the share of tests passed.

**Spaced repetition:** problems I failed or needed hints on come back after 1, 3, 7, and 14 days.

**Interview rubric:** understanding and clarification, algorithm quality, correctness, code quality, complexity analysis, testing and edge cases, communication.

### 6.3 Low-Level Design
Both formats run against hidden unit tests in the judge.

**Format A, "Complete the system":**
- File 1 is 100–200 lines of provided code: models, utilities, and interfaces the system depends on. It is editable, but edits to it are tracked and flagged.
- File 2 is either method stubs with docstrings, or completely empty with only a README describing the required behavior and the public API the tests call.
- I implement file 2 so the program works.

**Format B, "Implement the class":** a single file containing a class skeleton and method stubs. A spec describes the class's overall responsibility and each method's contract: inputs, outputs, errors, expected complexity, and thread-safety when relevant.

**Seed problems.** At least 20 problems split across both formats, each available in Python and at least one compiled language:
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

**Interview mode:** at about 60% of the time, the interviewer introduces a requirement change (e.g. "now support VIP spots") and an extra set of hidden extension tests unlocks.

**Test display:** visible tests run any time. On submit, show pass counts by category: core, edge, and extension.

**Grading:** tests passed, plus an LLM review covering:
- separation of concerns
- appropriate patterns without over-engineering
- naming and encapsulation
- error handling and extensibility
- complexity of key operations
- consistency with file 1's conventions

**Debrief:** the reference implementation, design notes, and a Mermaid class diagram.

### 6.4 AI Fluency
**Shared workspace** (CoderPad-like):
- a file tree, Monaco tabs, and a run panel that executes the project's tests or commands in the sandbox
- an AI Assistant side panel (ASSISTANT_MODEL) where I attach files or selections through "add to context"
- in interview mode, a separate AI Interviewer chat

Every assistant interaction is logged: my prompt, the attached context, the response, and whether I copied or applied it. Code from the assistant is applied through a diff preview with per-hunk accept or reject.

**Assistant setting:** "Realistic" (the default) or "Fallible". In Fallible mode, about 20% of code-producing responses contain a subtle bug or an unjustified assumption. This is revealed only in the debrief, to train my verification habits.

#### 6.4.1 Code comprehension (60 min, modeled on Google's 2026 pilot format)
**Codebases.** 200–500 unfamiliar lines across 1–5 files, in Python, Java, C++, or TypeScript. Example domains:
- rate-limited service, inventory system, CSV ETL pipeline
- HTTP cache, event scheduler, tiny interpreter
- matching engine, session/auth manager, route planner, pagination API

**Hidden manifest for each codebase:**
- 4–8 planted bugs of varying subtlety, for example:
  - off-by-one errors and boundary bugs
  - mutable default arguments and race conditions
  - overflow, stale cache invalidation, and resource leaks
  - swallowed errors, timezone or float mistakes
  - an accidental O(n²) hot path
- 2–4 debatable design decisions, each with arguments both ways.
- 3–5 improvement opportunities.

**My tasks:**
1. Summarize what the system does.
2. Find bugs using line-anchored gutter annotations with category and severity. I can optionally prove a bug with a test I write and run.
3. Discuss the design decisions with the interviewer.
4. Propose improvements, and optionally implement one.

**Phases:** orientation 5m → bug hunt 30m → design discussion 15m → improvements and wrap-up 10m. Interviewer prompts include "walk me through this function", "why might the author have done X?", and "what breaks at 100x scale?"

**Grading:**
- bug recall and precision, matched by line range plus an LLM semantic match
- severity calibration and summary accuracy
- depth of design reasoning
- quality of AI use: speeding up understanding vs blindly trusting, and verifying claims by running code
- communication

#### 6.4.2 AI-generated code review (30–45 min)
**PR view.** A GitHub-style pull request "written by an AI agent":
- title and description
- unified or split diff across 1–4 files, with full-file view
- inline comments on diff lines
- a final decision (Approve, Request changes, or Reject) with a summary comment
- a "Fix it" option that opens the branch in the editor with tests runnable

**Seeded issues.** At least 15 PRs, with issue types including:
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

**Grading:**
- whether the final decision is correct
- severity-weighted recall and precision on issues
- whether my fixes pass the tests
- comment quality: specific, actionable, professional

#### 6.4.3 Feature extension in an existing repo (45–60 min)
**Repos.** 8–20 files and 500–2000 lines, with an existing test suite and clear conventions (layering, naming, error handling, logging). Each has a product ticket with acceptance criteria. Examples:
- todo API: add tags and filtering
- CLI expense tracker: add recurring expenses and budget alerts
- chess engine: add castling and en passant
- booking service: add a waitlist
- static site generator: add tag pages
- job queue: add exponential backoff and a dead-letter queue
- API client: add a caching layer

I'm expected to use the AI assistant.

**Grading:**
- hidden acceptance tests pass, with no regressions
- structural fit: follows existing patterns, no duplication, sensible placement. LLM-judged against a reference implementation and a conventions doc.
- prompting quality: clear specs, relevant context, task decomposition, iteration
- verification behavior: ran tests after applying output, reviewed diffs before accepting, caught Fallible-mode bugs, added tests
- time management

The grader receives the full assistant log.

### 6.5 Behavioral (30–45 min)
**Question bank.** At least 80 questions tagged by competency:
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

**Story bank:**
- I write STAR stories: situation, task, action, result, metrics, reflection, and competency tags.
- A coverage matrix (competency × story) flags gaps and over-reliance on any single story.

**Mock flow:**
- The interviewer asks 4–6 questions, each followed by 1–3 probing follow-ups:
  - "what did YOU specifically do?"
  - "what was the measurable result?"
  - "how did the other person react?"
  - "what would you do differently?"
- Each answer gets a 2–3 minute soft timer with a visual indicator.
- With voice on, also show filler-word count, words per minute, and answer length.

**Grading per answer:** STAR structure, specificity, ownership ("I" vs "we"), impact and metrics, reflection, relevance, and concision.

**Stronger-version rewrite:** for each answer, write a stronger version using only facts I actually gave (never fabricate), and list the missing facts I should add.

### 6.6 ML rounds
**Design workspace** (shared by all ML design rounds):
- Left: the prompt and the interviewer chat.
- Center: an Excalidraw whiteboard. Each turn, its elements, labels, and arrows are exported as a text graph for the interviewer.
- Right: a structured notes panel with collapsible sections templated per round type (optional for me to use).

The interviewer injects scale numbers and curveballs mid-round, e.g. "10x traffic on weekends", "a GPU node died mid-run", or "labels arrive 30 days late".

Each ML item has a hidden rubric with must-hit points, strong signals, and red flags. The grader scores coverage, depth, tradeoff reasoning, quantitative estimation, and communication. The debrief includes a reference design (Mermaid diagram plus a writeup).

#### 6.6.1 ML system design (45–60 min)
**Prompts** (at least 12): feed ranking, video recommendations, ads CTR prediction, search ranking, payment fraud, spam/abuse detection, ETA prediction, people-you-may-know, notification send-time optimization, content moderation, query autocomplete, dynamic pricing, RAG support assistant.

**Rubric coverage:**
- problem framing and business metrics; requirements and scale estimates
- data ingestion, batch vs streaming; labeling
- features and feature store: online/offline consistency, point-in-time correctness, training-serving skew
- model choice and training pipeline
- offline evaluation and A/B testing
- serving architecture
- monitoring: data and concept drift, performance, alerting, feedback loops
- retraining cadence, privacy and fairness, fallbacks, tradeoffs

#### 6.6.2 Inference and serving design
**Prompts** (at least 8):
- LLM chat endpoint at 7B and 70B scale with a p99 target
- real-time ranking at 50k QPS within 100ms
- image moderation at scale; embedding service
- on-device vs server inference; multi-model serving platform

**Topics:**
- latency budget breakdown
- dynamic and continuous batching; KV cache
- caching: features, results, embeddings
- quantization (INT8, INT4, FP8), distillation, and pruning, with accuracy tradeoffs
- speculative decoding; CPU vs GPU
- GPU autoscaling: queue depth vs utilization signals, cold starts, warm pools
- load balancing; model versioning; canary and shadow deploys
- tail latency; cost per 1k requests; observability

#### 6.6.3 Distributed training
**Prompts** (at least 8): train a 70B LLM on 1024 GPUs, scale a recommender with huge embedding tables, survive failures in a multi-week run, cut training time 4x.

**Topics:**
- data parallelism: DDP, all-reduce, gradient accumulation
- ZeRO/FSDP sharding
- tensor, pipeline, sequence, and expert parallelism (bubbles, micro-batches, 1F1B)
- mixed precision; activation checkpointing
- interconnects: NVLink vs InfiniBand
- checkpointing: frequency, async, sharded
- failure detection and elastic recovery; stragglers
- data loader throughput; reproducibility; loss spikes
- back-of-envelope compute estimates (FLOPs ≈ 6·N·D)

#### 6.6.4 ML fundamentals
**Two sub-modes:**
- (a) Oral rapid-fire with adaptive difficulty and "why?" / "when does that fail?" follow-ups.
- (b) A quiz with MCQ and short-answer questions, graded against key points, with spaced repetition.

**Bank** (at least 200 questions):
- bias-variance; over- and underfitting
- regularization: L1/L2, dropout, early stopping, augmentation
- losses: MSE, MAE, Huber, cross-entropy, hinge, focal, contrastive, ranking losses
- optimizers and learning-rate schedules; vanishing and exploding gradients; batch norm vs layer norm
- metrics: precision/recall/F1, ROC-AUC vs PR-AUC, calibration, log loss, NDCG/MAP/MRR, RMSE
- choosing metrics for imbalanced data; cross-validation and leakage; class imbalance
- trees vs linear models vs neural nets; bagging and boosting
- k-means and PCA; embeddings; transformer basics
- probability and statistics: Bayes, MLE vs MAP, hypothesis tests, p-values, A/B testing pitfalls

#### 6.6.5 Applied ML design (45 min)
**Prompts** (at least 10): marketplace search ranking, home-feed recommender, "also bought", job matching, notification relevance, news personalization, playlist continuation, cold start.

**Rubric emphasis:**
- label definition: implicit vs explicit feedback, negative sampling, delayed labels, position bias
- candidate generation vs ranking stages
- features: user, item, context, and crosses
- model progression: heuristic → GBDT or logistic → two-tower → deep ranker
- pointwise, pairwise, and listwise losses
- offline evaluation: NDCG@k, recall@k, calibration, slicing
- online evaluation: A/B tests, guardrail metrics, novelty effects, interleaving
- exploration and bandits; feedback loops; iteration plan

## 7. Mock loops and company presets
**Loop builder:** an ordered list of rounds with durations and optional breaks.

**Presets:**
- Big Tech SWE Intern: recruiter, DSA, DSA, behavioral.
- Google-style SWE: DSA, DSA, AI-fluency comprehension, Googleyness behavioral.
- Meta-style: 2 DSA rounds with 2 problems each in 45 min, then behavioral.
- Startup SWE: LLD, feature extension, behavioral.
- MLE: DSA, ML fundamentals, ML system design, applied ML, behavioral.
- ML Infra: DSA, serving, distributed training, behavioral.
- OA Only.

**Company presets** (persona style, question weighting, and rubric emphasis) live in content/companies/*.yaml. They are clearly labeled unofficial approximations.

**End of loop:** a hiring committee packet with all scorecards, an overall summary, and weaknesses that recur across rounds.

## 8. Dashboard and progress
- **Home:** streak, due spaced-repetition reviews, and a recommended next session based on my weakest dimensions and tags.
- **Analytics:**
  - score trends per round type and rubric dimension
  - DSA by tag: solve rate, average time, hints used
  - AI Fluency recall and precision trends
  - behavioral competency coverage
- **History:** session history with full replay.
- **Export:** JSON export and import of all data, and markdown export of any debrief.

## 9. Data model (minimum; refine in PLAN.md)
- users: one default user, but keep user_id columns.
- resumes
- content_items: type, slug, version, manifest JSON, source.
- sessions: round type, item, mode, loop_id, timestamps, status.
- events: session_id, ts, kind, payload JSON. Kinds are chat, code_snapshot, run, submit, hint, approach_check, assistant_prompt, assistant_response, annotation, whiteboard_snapshot, phase_change.
- submissions
- scorecards: includes the model and prompt_version.
- stories
- srs_cards
- loops and loop_rounds
- settings

Version every prompt template so I can compare grading across versions.

## 10. Non-functional requirements
- **Performance:** a snappy editor and judge; typical time to the interviewer's first token under 2s.
- **Robustness:**
  - Autosave every 5s, and resume sessions after a refresh.
  - On LLM errors, retry with backoff and show a banner. Never lose my work.
- **Cost:**
  - FAST_MODEL for hints, approach checks, and short replies; GRADER_MODEL only for final grading.
  - Use prompt caching for large static context (codebases, rubrics) where the provider supports it.
  - Show token usage per session, with a configurable per-session token cap.
- **UX:**
  - Keyboard shortcuts: Cmd+Enter runs, Cmd+Shift+Enter submits, Cmd+K opens a command palette.
  - Dark mode by default.
- **Privacy:** everything stays local. Resume and transcripts go only to the LLM API.
- **Hidden content:** reference solutions, hidden tests, manifests, and rubrics are never sent to the browser before the debrief. Add a test that inspects API responses to verify this.

## 11. Milestones (in order; each one shippable)
- **M0 Scaffold:** monorepo, docker-compose, Next.js, DB, lint, format, and test setup, CLAUDE.md, app shell and navigation.
- **M1 Judge:**
  - Runner service with Python and C++ first, then Java and JS/TS.
  - DSA harness and checkers.
  - Sandbox tests for an infinite loop, a fork bomb, a memory hog, a network attempt, and a file write outside /work. All must be contained.
- **M2 DSA practice:** content schema, 15 seed problems working end to end, problem browser, editor UI, Run and Submit, hint ladder, Approach Check, editorial.
- **M3 Interviewer engine:** grading, debrief and replay, and DSA interview mode plus OA mode.
- **M4 Recruiter Screen and Behavioral:** includes resume handling, story bank, coverage matrix, and the voice flag.
- **M5 LLD:** both formats, the requirement-change mechanic, 8 seed problems.
- **M6 AI Fluency:** workspace, assistant panel and logging, diff-apply, Fallible mode, all three sub-formats with 4 seeds each.
- **M7 ML rounds:** whiteboard workspace, notes templates, all five sub-types, fundamentals quiz with spaced repetition, seeds.
- **M8 Loops and analytics:** mock loops, presets, hiring committee packet, dashboard and analytics, export.
- **M9 Scale and polish:**
  - Expand content to the target counts through content:generate and content:validate, with my review of drafts.
  - Polish, e2e tests for every round type in both modes, README with screenshots.

## 12. Definition of done
- On a clean machine with only Docker installed and ANTHROPIC_API_KEY set in .env, `docker compose up` starts everything.
- All content passes `content:validate`, and all unit and e2e tests pass.
- I can complete every round type in both modes and get a scorecard with evidence.
- All sandbox containment tests pass, and the no-hidden-content-leak test passes.
