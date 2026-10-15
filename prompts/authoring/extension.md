# Brief: author a feature-extension repository for swemock

You are drafting one **extension** item: a small, well-structured repository with its own conventions, a
ticket for a new feature, hidden acceptance tests, and a reference implementation. The candidate (with an
AI assistant at hand) adds the feature; they are graded on the hidden tests, on not breaking the existing
ones, on time, on how they verify, and on following the repository's conventions. Give the result to the
maintainer as `content/extension/<slug>/`; it must pass `pnpm content:validate extension/<slug>`.

Start with `pnpm content:new extension <slug> --title "..." --difficulty medium`.

## What a good repository looks like

- **8–20 files, 500–2000 lines** (hard minimum: 300 lines of non-test code), layered so that the right place
  for new code is a real decision: for example `api -> service -> store`, with `validation`, `filters`, and
  `serializers` modules. Use the standard library only.
- **A `CONVENTIONS.md`** the code actually follows, in 6–10 short rules: layers and who may call whom,
  where validation lives, error types, immutability, naming, where tests go. A good feature breaks no rule;
  a rushed one dumps logic in the wrong layer.
- **A passing test suite** (`repo/tests/`) with a `conftest.py` that puts `src/` on the path, so the
  candidate can run it at once.
- **A ticket** (`ticket.md`) that states the behavior precisely: signatures, field names, messages, error
  cases, ordering. Everything a hidden test asserts must be in the ticket.

## Folder layout

```
content/extension/<slug>/
  item.yaml        metadata and the interview questions
  ticket.md        the ticket the candidate sees
  repo/            the repository as shipped (CONVENTIONS.md, src/..., tests/...)
  tests_hidden/    hidden tests: names with `acceptance` for the new behavior, `regression` for old behavior
  reference/       files that replace or add to repo/ to give a complete, passing solution
```

Hidden tests live outside the repo, are copied to `tests/hidden/` at grading time, and must import the
package themselves (`sys.path.insert(0, ".../src")`), since a conftest may not apply to them.

## Tests

- Acceptance tests: `test_acceptance_*`. Regression tests: `test_regression_*` (existing behavior that a
  careless change could break). The validator requires that all acceptance tests fail on the untouched repo,
  that regression tests pass on it, and that everything passes with `reference/` applied.
- If the feature legitimately changes behavior the existing tests encode, put the updated test files in
  `reference/tests/` and say in the ticket that existing tests need updating.
- No sleeping, no network, no randomness without an injected source.

## item.yaml

```yaml
title: Todo API: tags and filtering
difficulty: medium
tags: [http, refactoring]
source: authored
reviewed: false
version: 1
language: python
minutes: 45
questions:        # asked in the wrap-up of a scripted interview
  - ...
```

## Checklist

1. Does every assertion in `tests_hidden/` follow from `ticket.md`?
2. Does the reference follow `CONVENTIONS.md` exactly (it is the model answer)?
3. Is there more than one plausible place to put each piece, so convention-following is a real choice?
4. `pnpm content:validate extension/<slug>` passes.
