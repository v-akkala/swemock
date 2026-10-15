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

## AI providers and API keys

- API keys are encrypted at rest with AES-256-GCM. The master key is generated on first use into the
  data volume (`/data/master.key`, mode 0600). Keys are never logged and never returned to the browser;
  the UI shows `••••••••` plus the last four characters.
- Model calls run only on the server. The only outbound traffic is to the provider you configure (and
  nothing at all with provider `none` or a local Ollama).
- During a round the AI interviewer has the hidden reference material in its prompt. Its output passes a
  server-side **leak filter** before reaching the browser: 8-token shingles of the reference solutions,
  10-word shingles of the editorial and later hints, and (in interview mode) any code block longer than
  three lines. Replies are streamed with a 160-character look-behind and nothing inside an open code fence
  is released, so text is checked before it leaves the server. A blocked reply is replaced and logged.
- `SWEMOCK_TEST_MODE=1` enables a deterministic fake provider and a data-reset endpoint for end-to-end
  tests. It is off by default and must not be set on a stack you use.

## Web app

- Published on `127.0.0.1` only.
- `/api/*` requires a loopback `Host` header (blocks DNS rebinding) and, for writes, a same-origin
  JSON request (blocks CSRF from other sites). Extra hostnames can be allowed with
  `SWEMOCK_ALLOWED_HOSTS`.
- No telemetry and no outbound calls except to an AI provider you configure (from M3).

## Resumes, stories, and voice

- **Resumes and story-bank entries** are personal data. They are stored only in the local database
  (`/data`), included in no log, and leave the machine only when you copy a packet or use a connected
  provider you configured.
- **PDF upload** goes to the local server, never to a third party: the file must start with `%PDF`, be at
  most 5 MB and 8 pages, and its text is extracted in-process (`unpdf`, pure JavaScript, no external
  binary). Nothing is stored except the text you review and save. Uploads are multipart POSTs and pass the
  same same-origin guard as every other write.
- **Voice input** is off by default (Settings). It uses the browser's Web Speech API; in Chrome and Edge
  the browser sends the audio to its vendor (Google or Microsoft) to transcribe it. swemock itself never
  receives audio, only the transcribed text and how many milliseconds of speech there were.
- **Question key points and strong-answer signals** follow the hidden-content rules above: a live packet
  never contains them, the AI interviewer sees them but its replies pass the leak filter (which also catches
  a short secret quoted whole), and the browser receives them only after the candidate answers in the
  recruiter screen (by design) or in the debrief.

## LLD workspaces

- A run copies the candidate's editor files (only the files the manifest lists; anything else the browser
  sends is dropped), the support files, and the test files into the sandbox like any project run: no
  network, read-only root, tmpfs `/work`, resource limits. The commands are fixed per language in
  `@swemock/shared` (`LLD_TEST_COMMAND`), not read from content.
- Hidden and extension test sources are merged server-side and never sent to the browser. Results show only
  "Hidden test #k", its category, and pass/fail: no names, messages, or tracebacks. If the build fails and
  the compiler output mentions a hidden test file, the output is replaced by a generic message, because
  compilers print the offending source line.
- Reference implementations, design notes, the class diagram, and the requirement change are private until the
  debrief (or until a practice session reveals them deliberately: the hint ladder and the "requirement change"
  button). The AI interviewer sees them, so its replies pass the same leak filter as in DSA.
- The class diagram is drawn in the browser by Mermaid with `securityLevel: "strict"`.

## AI Fluency workspaces and the assistant

- Runs use the same sandbox as everything else: only the files of the item plus new files under safe names
  and paths reach the container (names are checked, `..` and `tests/hidden` are refused, sizes are capped),
  with no network and the usual limits. Commands come from the item's manifest, never from the browser.
- Planted-bug explanations, the `bugtests/`, hidden tests, and reference implementations are private to the
  server until the debrief. A review's issues and an extension's hidden tests are read only by the grading
  and debrief code. The e2e specs scan every response body for them.
- The assistant sees only what the candidate attaches (a file or a selection, capped in size). Its prompts
  and replies are stored locally with the session. With a hosted provider they are sent to that provider like
  any other model call; with provider `none` nothing leaves the machine (a packet is copied by the user).
- **Fallible mode** modifies the assistant's proposed code in the server before it is returned. The
  modified text is parsed in the sandbox first, and the mutation record never reaches the browser during the
  round. Applying a proposal only changes the candidate's own editor buffer.
- Code from a reply goes through a per-hunk diff preview; nothing is written to the workspace without the
  candidate pressing apply.
