# Adding DSA problems

New problems are plain files under `content/dsa/<slug>/`. There is nothing to register and no code to
change. You need Docker and the sandbox images (`docker compose build sandbox-python sandbox-cpp`), plus
`pnpm install` once.

```bash
pnpm content:new dsa my-problem --title "My Problem" --difficulty medium   # 1. scaffold a working example
# edit problem.yaml, statement.md, editorial.md, solutions/, tests/visible.json, tests/gen.py
pnpm content:gen my-problem                                                # 2. compute hidden tests + timings
pnpm content:validate my-problem                                           # 3. check everything (seconds)
```

Then delete the `# SCAFFOLD` line at the top of `problem.yaml` and commit. If the app is running
(`docker compose up`), the problem appears in the browser within a few seconds of the files changing,
because `./content` is mounted into the app. Contributors who `git pull` get new problems the same way,
without rebuilding images.

## What you write

| File | Purpose |
| --- | --- |
| `problem.yaml` | title, difficulty, topics, signature (once, for every language), checker, 4 hints, follow-ups |
| `statement.md`, `editorial.md` | the problem and the full explanation (KaTeX math supported) |
| `solutions/reference.py` and `reference.cpp` | model solutions; they define the expected outputs |
| `solutions/brute.py` | naive solution, required when `tle_guard: true` |
| `tests/visible.json` | 3-5 sample tests the user sees |
| `tests/gen.py` | seeded generator of at least 15 hidden tests (edge, random, stress) |

Generated and committed by `content:gen`: `tests/hidden.json` and `tests/meta.json`.

You never write drivers or editor stubs: they are generated from the signature for both languages.

## Commands

- `pnpm content:validate` with no arguments checks only the items you changed (against `main`);
  `pnpm content:validate --all` checks everything (this is what CI runs).
- `pnpm content:gen <slug>` is safe to rerun; it overwrites `hidden.json` and `meta.json`. Rerun it
  whenever you change `gen.py` or a reference solution.
- Validation checks: manifest schema; tests match the signature; both references pass all visible and
  hidden tests within the limits; the brute force times out on a stress test when `tle_guard` is set;
  `gen.py` is reproducible; generated stubs compile; the statement and editorial have the required
  sections.

## Drafting with an AI tool

Give `prompts/authoring/dsa.md` to any assistant together with an idea ("a medium problem about
monotonic queues"). It is a complete brief with the rules, formats, and a checklist. Whatever it drafts
must still pass `pnpm content:validate`, and a maintainer reviews it (`/content-review` in the app) before
it counts as reviewed.

## Review

Authored content ships with `reviewed: false`. Open `/content-review` in the app, read each item, and
approve it. Approval is stored in the local database; editing an item resets it, because the content
changed.

# Adding questions (CS fundamentals and behavioral)

Questions are one folder each with a single `question.yaml`, and they need no Docker or sandbox:

```bash
pnpm content:new cs hash-map-lookup-cost --difficulty easy     # content/cs/<slug>/question.yaml
pnpm content:new behavioral took-ownership                     # content/behavioral/<slug>/question.yaml
pnpm content:validate cs/hash-map-lookup-cost                  # schema + checks, in a fraction of a second
pnpm content:validate --type cs                                # a whole bank
```

Edit the scaffold (it is a small valid example), delete the `# SCAFFOLD` line, and commit. A running app
picks the file up within a few seconds, exactly like a DSA problem. Guides to hand to an AI drafting tool:
`prompts/authoring/cs.md` and `prompts/authoring/behavioral.md`.

What is checked: the schema (closed vocabularies for topics, competencies, and lenses, so typos fail);
CS questions have 2–8 distinct key points and a real model answer, and an MCQ has exactly one correct
option; behavioral questions have 3–5 distinct follow-ups and at least two strong-answer signals; no two
questions share a title or prompt (checked against every question already on disk).

Key points and strong-answer signals are **private**: the browser sees a CS question's prompt, and the
key points appear only after the candidate answers (recruiter screen) or in the debrief. A behavioral
question's follow-ups, signals, and red flags appear only in the debrief.

# Adding low-level design (LLD) problems

LLD problems are folders under `content/lld/<slug>/` with the spec, a design write-up, a Mermaid diagram,
the requirement change, and per language a starter, a reference, and three groups of tests (visible, hidden,
extension). Needs Docker and the sandbox images, like DSA.

```bash
pnpm content:new lld my-system --title "My System" --difficulty medium   # scaffold: a tiny working example
# edit problem.yaml, spec.md, design.md, diagram.mmd, change.md, python/..., cpp/...
pnpm content:validate lld/my-system                                        # runs the reference and the starter against every test
```

The validator checks: the manifest and files; test names carry a category and sit in the right folder; the
reference passes every visible, hidden, and extension test (the extension tests run as their own build, as in
the app); the starter builds and fails; hidden tests are recognized as hidden; the diagram is a `classDiagram`.
Full guide, also usable as a brief for an AI drafting tool: `prompts/authoring/lld.md`.

In the app a problem appears at `/lld`. In practice the candidate runs the visible tests any time and
submits to run the hidden ones (results show only counts per category and "Hidden test #k"); a "requirement
change" button brings in the extension tests. In an interview the change arrives by itself at 60% of the time.

# Adding AI Fluency items (comprehension, review, extension)

Three item types live under `content/comprehension/`, `content/review/`, and `content/extension/`, each a
folder with an `item.yaml`. They need Docker and the sandbox images (the validator proves every claim by
running code), and Python is enough.

```bash
pnpm content:new comprehension my-codebase --title "My Codebase" --difficulty medium
pnpm content:new review my-pr --title "My PR" --difficulty medium
pnpm content:new extension my-repo --title "My Repo" --difficulty hard
pnpm content:validate comprehension/my-codebase     # likewise review/..., extension/..., or --type comprehension
```

What is checked:

- **comprehension**: 4–8 bugs, each with an exact-replacement `fix` that starts inside its planted `lines`, a
  `test_bug_<id>` in `bugtests/` that fails on the buggy code and passes with that one fix, shipping tests that
  pass on the buggy code, and every test passing with all fixes applied. Codebase at most 5 files.
- **review**: at most 4 changed files; issues point into changed files; an `approve` PR passes the hidden tests
  as submitted and has only low-severity nits; any other decision must fail them as submitted and pass once
  every issue's fix is applied.
- **extension**: the existing suite passes; acceptance tests (`test_acceptance_*`) fail on the untouched repo;
  regression tests pass on it; the `reference/` overlay passes everything; `CONVENTIONS.md` exists.

Full briefs, also usable for an AI drafting tool: `prompts/authoring/comprehension.md`, `review.md`, and
`extension.md`. Size warnings (a codebase under 200 lines, a repo under 500) are advisory.

Bug explanations, `bugtests/`, hidden tests, and the reference are **private**: the browser sees the code, the
brief or ticket, the shipping tests, and (for a review) the diff. They appear only in the debrief.
