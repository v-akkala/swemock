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
