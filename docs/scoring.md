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
