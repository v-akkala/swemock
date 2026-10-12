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
