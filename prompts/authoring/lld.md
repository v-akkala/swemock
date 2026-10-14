# Brief: author a low-level design (LLD) problem for swemock

You are drafting one LLD problem: a small system the candidate designs and implements against hidden unit
tests, with an authored requirement change that arrives about 60% of the way into an interview. Give the
result to the maintainer as a folder `content/lld/<slug>/`; it must pass `pnpm content:validate lld/<slug>`
(needs Docker and the sandbox images), and a human reads it before it counts as reviewed.

Start with `pnpm content:new lld <slug> --title "..." --difficulty medium`: it creates every file with a tiny
working example (a `Tally` class in Python and C++). Replace the content and keep the structure.

## What a good problem looks like

- **A system someone could sketch on a whiteboard in ten minutes**, with real design choices: where the
  state lives, who owns which rule, which data structure makes the main operations cheap.
- **A spec precise enough to test.** Every behavior a hidden test checks must be stated in `spec.md` (return
  values, errors, ordering, tie-breaks, validation). If a candidate could reasonably do something else and be
  marked wrong, the spec is missing a sentence.
- **Original.** Write the spec, tests, and notes yourself. Classic systems (an LRU cache, a parking lot) are
  fine in your own words and with your own API; never copy another platform's problem statement or tests.
- **A requirement change that stresses extensibility**, not a rewrite: a good design absorbs it in a few
  lines; a poor one has to restructure.

## Formats

- `format: class` (Format B): one file with a class skeleton; no provided file.
- `format: system` (Format A): **file 1** is provided code (`role: provided`, 100–200 lines of models, errors,
  helpers; editable, but edits are tracked and flagged) and **file 2** (`role: solution`) is stubs with
  docstrings, or empty.

## Folder layout

```
content/lld/<slug>/
  problem.yaml        metadata, files per language, 4 hints, follow-ups
  spec.md             what the candidate sees: the contract
  design.md           design notes shown in the debrief (what to build, what to avoid, complexity)
  diagram.mmd         Mermaid classDiagram of the reference design
  change.md           the requirement change (private until introduced)
  python/  and/or  cpp/
    starter/<files>         starting content of every editor file listed in problem.yaml
    reference/<files>       the model solution (only the solution files; provided files stay as given)
    support/                conftest.py (Python) or doctest_main.cpp (C++): copy from the scaffold
    tests/visible/          tests the candidate can run any time (≥ 3)
    tests/hidden/           hidden core and edge tests (≥ 2 core, ≥ 2 edge)
    tests/extension/        tests for the requirement change (≥ 3), unlocked when it is introduced
```

## problem.yaml

```yaml
title: LRU Cache
difficulty: easy                  # easy | medium | hard
tags: [caching, data-structures]  # LLD_TAGS in packages/content/src/lld/manifest.ts
source: authored
reviewed: false
version: 1
format: class                     # class | system
minutes: 45                       # interview length; the change arrives at 60% of it
languages:
  python:
    files:
      - { path: lru_cache.py, role: solution }
  cpp:
    files:
      - { path: lru_cache.hpp, role: solution }
hints: [ ..four.. ]               # nudge, key idea, approach in words, near-code
followups: [ ..1–8.. ]            # asked in the wrap-up phase and shown in the debrief
```

Python only is fine ("in at least one of them"); add C++ where it is practical.

## Tests

- **Names carry the category**: Python `test_core_…`, `test_edge_…`, `test_extension_…`; C++ doctest
  `TEST_CASE("core: …")`, `"edge: …"`, `"extension: …"`. Extension tests live only in `tests/extension/`.
- Hidden tests never reveal their source: results show only "Hidden test #k" and the category, so a failing
  hidden test must be diagnosable from the spec alone.
- Inject the clock (and anything else nondeterministic) through the constructor; never sleep.
- C++ solutions are **header-only** (`inline` or in-class definitions): the tests `#include` them. The starter
  stubs must compile and fail (`throw std::logic_error("not implemented")`).
- Extension tests run in a separate build, so a candidate who hasn't written the new API still gets their core
  and edge results.
- Tests import the candidate's module by name (`from lru_cache import LRUCache`); that name is part of the spec.

## Checklist before you hand it back

1. Does `spec.md` state every behavior a test checks, including errors and tie-breaks?
2. Could the reference be written in about 15 minutes? Is the starter stub honest (no hints in comments)?
3. Does the requirement change fit a good design in a few lines, and break a bad one?
4. `pnpm content:validate lld/<slug>` passes: the reference passes everything, the starter doesn't, hidden
   tests are recognized as hidden, and counts match.
