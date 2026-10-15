# Brief: author an AI-generated-code review item for swemock

You are drafting one **review** item: a pull request "written by an AI agent" that the candidate reviews,
comments on line by line, and decides on (approve, request changes, or reject). Some PRs are correct: the
right call is then *approve with nits*, and over-flagging is penalized. Give the result to the maintainer as
`content/review/<slug>/`; it must pass `pnpm content:validate review/<slug>` (Docker + sandbox images).

Start with `pnpm content:new review <slug> --title "..." --difficulty medium`.

## What a good PR looks like

- **Small and believable**: 1–4 changed files, a title and description in the voice of an AI agent that is
  confident and a little too tidy.
- **Seeded problems an AI agent really makes**: hallucinated APIs (a method that doesn't exist), hollow tests
  that cannot fail, an off-by-one the tests miss, a description that claims something the code does not do,
  missing validation, an injection or traversal, a hard-coded secret, scope creep, an N+1 query.
- **One of each kind of verdict across the bank**: some `request_changes`, some `reject` (fundamentally
  unsafe or wrong), some `approve` (correct, with 1–2 low-severity nits).
- **Hidden tests that encode correctness.** For a non-approve PR, at least one hidden test fails on the PR as
  submitted and all pass once the fixes are applied. For an approve PR, the hidden tests pass as submitted.

## Folder layout

```
content/review/<slug>/
  item.yaml       metadata, the PR title and description, the right decision, the seeded issues, questions
  base/           the repository before the PR
  head/           the repository after the PR (a full snapshot; files that differ from base are "changed")
  tests/          tests that exist before the PR (run in the candidate's workspace)
  tests_hidden/   hidden correctness tests, run by "Check my fix"
```

The PR's own tests belong in `head/` (for example `head/test_search.py`); they are part of the diff and a
candidate may criticize them (a `hollow-test` issue lives in a head file).

## item.yaml

```yaml
title: Product search
difficulty: medium
tags: [http, security]
source: authored
reviewed: false
version: 1
language: python
minutes: 35
pr:
  title: Add product search and match count
  description: |
    ...                       # claims that the code may or may not keep
decision: request_changes     # approve | request_changes | reject
issues:                       # every issue needs a changed file; `fix` is optional but recommended
  - id: sql-injection
    file: search.py
    lines: [3, 3]
    category: security
    severity: high
    title: ...
    explanation: ...          # debrief only
    fix: { file: search.py, old: "...", new: "..." }
acceptable: [{ file, lines, category?, note }]
questions: [ ... ]            # asked by the scripted interviewer
```

For `decision: approve`, issues may only be `low` severity nits.

## Checklist

1. Would a careful human reviewer agree with the `decision`? Is each issue visible in the diff?
2. For correctness issues, does a hidden test fail without the fix? (Security, scope and style issues need no
   test, but the hidden suite must still fail as a whole on a non-approve PR.)
3. Do the fixes apply cleanly (`old` appears once) and do all hidden tests pass afterwards?
4. `pnpm content:validate review/<slug>` passes.
