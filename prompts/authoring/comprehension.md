# Brief: author a code-comprehension codebase for swemock

You are drafting one **code comprehension** item: a small, realistic codebase with deliberately planted bugs
that a candidate reads, summarizes, annotates, and discusses with an AI assistant at hand. Give the result to
the maintainer as `content/comprehension/<slug>/`; it must pass `pnpm content:validate comprehension/<slug>`
(needs Docker and the sandbox images) and a human reads it before it counts as reviewed.

Start with `pnpm content:new comprehension <slug> --title "..." --difficulty medium`: a tiny valid example
with every file. Replace the content and keep the structure.

## What a good item looks like

- **Real code, not a puzzle.** 200–500 lines in at most 5 files, written the way a competent colleague
  would: sensible names, docstrings, mostly correct. Domains that work: caching, parsing, scheduling,
  auth/sessions, ETL, inventory, pagination, booking, CLIs.
- **4–8 planted bugs of different kinds**: a mix of off-by-ones, boundary mistakes, mutable defaults, stale
  state, swallowed errors, time handling, float precision, performance traps, security slips, hollow
  validation. Each is plausible, a single small change, and *findable by reading plus a test*.
- **Varied severity.** At least one `high` and one `low`. Severity is what a reviewer would say if this
  shipped, not how clever the bug is.
- **Two to four real design decisions** (`decisions`), each with an honest `for` and `against`; three to five
  `improvements`; a few `acceptable` spots that look odd but are fine (they are never counted as false
  positives).
- **Questions** (3–8) the scripted interviewer asks in the design phase.

## Folder layout

```
content/comprehension/<slug>/
  item.yaml       metadata, brief, bugs, decisions, improvements, acceptable, questions
  code/           the codebase the candidate sees (flat files)
  tests/          shipping tests: visible, runnable, pass on the buggy code
  bugtests/       one test per bug, named test_bug_<id with _ for ->; hidden until the debrief
```

## item.yaml

```yaml
title: HTTP Response Cache
difficulty: hard                # easy | medium | hard
tags: [caching, http]           # FLUENCY_TAGS in packages/content/src/fluency/manifest.ts
source: authored
reviewed: false
version: 1
language: python                # python is fine; C++ needs `commands` (no default)
minutes: 60
brief: |                        # what the candidate is told up front
  ...
bugs:
  - id: no-store-ignored        # lowercase, hyphens
    file: headers.py
    lines: [10, 10]             # inclusive; must include the line the fix starts on (±1)
    category: logic-error       # FINDING_CATEGORIES in packages/shared/src/fluency/match.ts
    severity: high              # low | medium | high | critical
    title: ...
    explanation: ...            # shown in the debrief only
    fix: { file: headers.py, old: "exact text", new: "replacement" }
decisions: [{ id, title, for, against }]
improvements: [ ... ]
acceptable: [{ file, lines, category?, note }]
questions: [ ... ]
```

A `fix` is an **exact replacement**: `old` must appear exactly once in the file. It is how the validator
proves each bug, and the debrief can show it.

## Tests

- `tests/` (shipping) must **pass on the buggy code**; if they failed, the bugs would be obvious. They give the
  candidate a safety net and a place to add their own tests.
- `bugtests/` has one `test_bug_<id>` per bug (id `no-store-ignored` -> `test_bug_no_store_ignored`). The test
  must **fail on the buggy code and pass once that one fix is applied** (other bugs still present), and all
  pass when every fix is applied.
- Tests must not share mutable state with each other (distinct ids, fresh objects): a leaked default makes a
  later test fail for the wrong reason. Inject clocks; never sleep.

## Checklist before you hand it back

1. Is every bug a *single* contiguous change, with a `fix` whose `old` text is unique?
2. Do the `lines` include where the fix starts (±1)? Candidates are matched by file, overlapping lines (±2),
   and category.
3. Could a careful reader find each bug without running anything? Could a test prove each one?
4. Are the `decisions` genuinely two-sided, and the `acceptable` spots genuinely fine?
5. `pnpm content:validate comprehension/<slug>` passes. Size warnings (200–500 lines) are advisory; the hard
   limits are 120+ lines and at most 5 files.
