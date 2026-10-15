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

## Recruiter screen

Dimensions: communication, resume ownership and depth, motivation and fit, CS fundamentals accuracy. Red
flags include overclaiming on the resume, being unable to explain one's own project, and stating
something wrong confidently.

- **Auto (fundamentals only):** the candidate grades each question themselves while its key points are on
  screen (got it = 2, partly = 1, missed = 0). The score is the share of weighted points, with difficulty
  weights 1/2/3, in the usual bands: under 25% → 1, under 50% → 2, under 75% → 3, otherwise 4. These
  grades are recorded one question at a time and can't be edited afterwards, which is why they count as
  *auto*; the checklist and an AI grade still override them (ai > self > auto).
- Everything else is **self** (checklist) or **ai**. Without those the scorecard shows only metrics: resume
  deep dives asked, fundamentals asked, and the self-grade tally.
- The question *selection* is adaptive: easy first; "got it" moves up a level, "missed" moves down.

## Behavioral

Dimensions: STAR structure, specificity, ownership, impact and metrics, reflection, relevance, concision.

- **Auto:** computed from the candidate's answers (messages of about 25 words or more):
  - *Ownership*: the share of first-person pronouns that are singular (I, me, my, myself) versus plural
    (we, us, our): ≥ 75% → 4, ≥ 55% → 3, ≥ 35% → 2, else 1.
  - *Impact*: the share of answers containing a number or metric (years don't count): ≥ 60% → 4, ≥ 40% → 3,
    ≥ 20% → 2, else 1.
  - *Concision*: average answer length: 90–380 words → 4, 60–89 or 381–480 → 3, 30–59 or 481–650 → 2, else 1.
- Also shown, not scored: time to answer (from the question to sending), and with voice on, filler words
  and words per minute. Fillers: um, uh, er, ah, hmm, "you know", "I mean", "sort of", "kind of",
  "basically", "literally", and "like" only when set off by commas. Pace needs at least five seconds of speech.
- Structure, specificity, reflection, and relevance come from the self checklist or an AI grade.

The formulas are version 1 (the new rubrics add dimensions; no existing formula changed).

## Stronger versions and resume feedback never invent facts

A rewrite (of a behavioral answer or a resume bullet) may use only facts the candidate gave. The app checks
this mechanically for numbers: any number in a suggested rewrite that appears nowhere in the candidate's own
words (or resume, or saved story notes) is rejected, for the connected model (which gets one automatic
retry) and for pasted replies. What a better answer needs is listed as "facts to add".

## Low-level design

Dimensions: working code (tests, auto), then the design review: separation of concerns, patterns without
over-engineering, naming and encapsulation, error handling and extensibility, complexity of key operations,
consistency with the provided code, and communication.

- **Working code (auto):** from the best submission: core and edge tests carry 75% and the extension tests 25%
  (all of it when the requirement change never came). All passing → 4, ≥ 85% → 3, ≥ 50% → 2, else 1; minus 1
  for three or more hints.
- **The design dimensions** come from the self checklist (revealed after the round) or an AI grade (live, or a
  pasted grading packet that includes the reference and the design notes for calibration).
- **Cap:** if the core and edge tests never all passed, the recommendation is at most Lean No Hire.
- Edits to the provided file are tracked (lines added and removed in each submission) and shown on the
  scorecard and in the grading packet, for the "consistency with the provided code" review.

## AI Fluency

Three rounds share one workspace and one measure of how the assistant was used.

**AI use** (all three; not scored when the assistant wasn't used, since not using it isn't penalized). Start
at 2, then: +1 if every applied reply was followed by running code (at least half of them, or nothing was
applied); +1 if the candidate pushed back or checked independently (rejected a hunk, wrote their own test, or
caught an injected mistake); −1 if three or more replies were applied and the code was never run afterwards;
−1 if fallible mode injected more mistakes than were caught. Clamped to 1–4. A mistake is *caught* when its
hunk was rejected, or the changed lines were fixed (the original line is back, or the mutated line is gone).

**Code comprehension** (auto: bug recall, precision, severity calibration, AI use; summary, design, and
communication come from the self checklist or an AI grade)

- Findings are matched to planted bugs by file, overlapping lines (±2), and category. The right place with the
  wrong category is *borderline*: the debrief asks the candidate to confirm or reject it, and the scorecard
  updates. A finding on an `acceptable` spot is not a false positive.
- *Bug recall* (severity-weighted, weights 1–4): ≥ 85% → 4, ≥ 60% → 3, ≥ 30% → 2, else 1.
- *Precision* (matched or acceptable over all findings): ≥ 85% → 4, ≥ 65% → 3, ≥ 40% → 2, else 1; reporting
  nothing scores 1.
- *Severity calibration* (1 when matched findings carry the planted severity, falling to 0 at three levels
  off): ≥ 80% → 4, ≥ 60% → 3, ≥ 40% → 2, else 1; only when something matched.

**AI-generated code review** (auto: decision, recall, precision, fix; comment quality and communication from
the checklist or an AI grade)

- *Decision*: the same call → 4; request changes versus reject → 3; approve versus request changes → 2;
  approve versus reject → 1; no decision → 1.
- *Recall* and *precision* as above. On a correct PR (nothing seeded) there is no recall, and every blocking
  finding counts against precision.
- *Fix* ("Fix it", checked against the hidden tests): all pass → 4, ≥ 75% → 3, ≥ 40% → 2, else 1.

**Feature extension** (auto: acceptance, regression, verification, time; structural fit and prompting from
the checklist or an AI grade)

- *Acceptance* (best submission): all → 4, ≥ 75% → 3, ≥ 40% → 2, else 1. *Regression*: all → 4, ≥ 90% → 3,
  ≥ 70% → 2, else 1.
- *Verification*: start at 1; +1 for two or more test runs; +1 for writing or editing a test; with assistant
  code applied, +1 if code was run after at least half the applies, +1 for rejecting a hunk or catching an
  injected mistake, −1 if it was never run after applying; −1 if injected mistakes were missed.
- *Time to a fully passing submission*: ≤ 60% of the time → 4, ≤ 80% → 3, otherwise 2; never → 1.
- **Cap:** if no submission ever passed everything, the recommendation is at most Lean No Hire.

Hidden bug explanations, the hidden tests, and the reference are shown only in the debrief. The formulas are
version 1 (the new rubrics add dimensions; no existing formula changed).
