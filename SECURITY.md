# Security

swemock runs code you type (and code an AI assistant writes) on your own machine. This document
describes how that code is isolated and what the threat model is.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.

## Threat model

**Protected:** your host — files, processes, network, the Docker daemon — and your swemock data
(database, encrypted API keys).

**Attacker:** code executed by the judge. It may be anything: infinite loops, fork bombs, memory
hogs, network scans, attempts to write files or escape the container. Other websites open in your
browser are also treated as hostile (see "Web app").

**Not a goal:** protecting verdict integrity from a user who deliberately games the judge. swemock
is single-user and local; cheating only cheats yourself.

## Sandbox design (spec §5.1, option A)

The `runner` service launches one short-lived **sibling container** per Run/Submit through the
host's Docker daemon.

Why sibling containers rather than nsjail/isolate inside the runner (option B): option B needs
`CAP_SYS_ADMIN` or `--privileged` plus user-namespace and cgroup v2 delegation inside a container,
which behaves differently across Docker Desktop (macOS/Windows), WSL2, rootless Docker, and Linux.
A one-command install can't absorb that. Option A uses Docker's own, well-audited isolation and
works the same everywhere Docker runs.

### Every sandbox container gets

| Control | Setting |
| --- | --- |
| Network | `NetworkMode: none` — loopback only, no routes |
| Filesystem | read-only root; tmpfs `/work` (128MB, exec) and `/tmp` (64MB, **noexec**); no bind mounts |
| User | `65534:65534` (nobody) |
| Privileges | all capabilities dropped, `no-new-privileges`, Docker's default seccomp profile, not privileged |
| Resources | 1 CPU, pids limit 64, memory = user limit + 384MB headroom (no swap), nofile 1024 |
| Time | per-test wall-clock limit enforced by the in-container agent; hard container kill at a deadline enforced by the runner |
| Output | user stdout/stderr capped at 64KB per test or command, 1MB per run; agent output capped at 32MB |
| Lifetime | removed after every run; leftovers (labelled `swemock.sandbox`) are removed when the runner starts |

Inside the container, `agent.py` (the entrypoint) marks itself non-dumpable so user code running
as the same uid cannot read its memory or file descriptors through `/proc`, and gives user
processes `oom_score_adj=1000` so the kernel kills them, not the agent.

### The Docker socket

Mounting the Docker socket gives root-equivalent control of the host to whoever can use it. It is
therefore confined:

- mounted **only** into `runner`, never into `web` or a sandbox;
- `runner` has **no published ports** and sits on an `internal: true` network shared only with `web`;
- every request must carry a 256-bit secret generated on first start (constant-time comparison);
- requests are validated with Zod: language allowlist, size limits (code 256KB, request 32MB,
  workspace 4MB, 200 tests), relative paths only, bounded time and memory limits;
- **image names are never taken from requests**: the runner maps the language to
  `${SWEMOCK_IMAGE_PREFIX}sandbox-<lang>:${SWEMOCK_SANDBOX_TAG}`, both set by compose;
- container options are built only by the runner (`services/runner/src/sandbox.ts`), with no bind
  mounts, devices, or extra privileges;
- the runner never executes user code itself; its own container is read-only with all capabilities
  dropped and `no-new-privileges`.

A restricting socket proxy was considered and not used: filtering by API endpoint still has to
allow container create, which is where an escape would be requested; the controls above are what
actually limit that.

### Verified by tests

`pnpm test:sandbox` (CI job `sandbox`) runs containment tests against the real images: infinite
loop, fork bomb (Python and C++), memory hog, network attempts (IP, DNS, host gateway), writes
outside `/work` and `/tmp`, executing from `/tmp`, running as nobody with no capabilities and
`no-new-privileges`, PID isolation, no Docker socket, the agent's `/proc` entries hidden, and
that no sandbox containers remain afterwards.

## Hidden content (reference solutions, hidden tests, hints, editorials)

Practice and assessment integrity depend on the browser never receiving content it shouldn't have yet.
Content is split when it is synced: `public_json` (statement, signature, sample tests) versus
`private_json` (hints, editorial, hidden tests, checker, reference solutions). Private content is read
only in `apps/web/src/server/dsa/service.ts` and leaves it only through deliberate reveals:

- hint *n* only after hint *n-1* in the session (or once the problem is solved),
- the editorial and reference solutions only after all four hints, a solve, or an explicit give-up,
- judge results pass through `mask.ts`: a hidden test exposes only its number, category, verdict and
  timing (no input, expected or actual output, stdout/stderr, or error text).

`apps/web/e2e/dsa.spec.ts` scans every response body during a session for hidden inputs, unrevealed hints,
the editorial and reference code. The same private/public split is what the spec's debrief (M3) builds on.

## Web app

- Published on `127.0.0.1` only.
- `/api/*` requires a loopback `Host` header (blocks DNS rebinding) and, for writes, a same-origin
  JSON request (blocks CSRF from other sites). Extra hostnames can be allowed with
  `SWEMOCK_ALLOWED_HOSTS`.
- No telemetry and no outbound calls except to an AI provider you configure (from M3).
