# Scoring (formula version 1)

Implemented in `packages/shared/src/scoring/` (`formulas.ts`, `rubrics.ts`) and unit-tested there. Each
scorecard stores the `formula_version` it was computed with; AI grades also store the grading packet's
version (for example `dsa-grading@1`).

## Dimensions and sources

A DSA interview is scored 1–4 on: understanding and clarification, algorithm quality, correctness, code
quality, complexity analysis, testing and edge cases, and communication. Each score is labeled with its
source:

- **auto**: measured from the event log (correctness, algorithm, testing).
- **self**: the rubric checklist, revealed after the round.
- **ai**: a connected grader, or a grading reply pasted back (same JSON schema).

Per dimension the most informed source counts: **ai over self over auto**. Every source stays visible.

## Auto (DSA)

- **Correctness**: best submission's share of tests: 100% → 4, ≥75% → 3, ≥40% → 2, else 1. Minus 1 for
  three or more failed submissions before acceptance, minus 1 more for three or more hints.
- **Algorithm**: accepted and comparable to the reference → 4, slower → 3, much slower → 2; not accepted →
  2 if ≥60% of tests passed, else 1. Minus 1 for one or two hints (including interviewer nudges), minus 2
  for three or more.
- **Testing**: never ran before submitting → 1; ran only the samples → 3; also ran custom input before
  acceptance → 4; no submission → 1.

## Self checklist

Each dimension has must-hit items (weight 2), strong signals (weight 1), and red flags. Coverage = ticked
weight ÷ total weight, minus 30 points per ticked red flag. Bands: under 25% → 1, under 50% → 2, under
75% → 3, otherwise 4.

## Recommendation

Needs at least one self or AI score; with objective metrics alone the scorecard shows only the metrics.
The mean of the final dimension scores maps to: ≥ 3.5 Strong Hire, ≥ 2.75 Lean Hire, ≥ 2 Lean No Hire,
otherwise Strong No Hire. **Hard cap:** if the hidden tests never all passed, the recommendation is at most
Lean No Hire. The AI grader's own recommendation is shown separately.
