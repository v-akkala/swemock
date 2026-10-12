# Brief: author a behavioral question for swemock

You are drafting one question for the behavioral bank. Give the result to the maintainer as a folder
`content/behavioral/<slug>/question.yaml`; it must pass `pnpm content:validate behavioral/<slug>` (no
Docker needed) and be read by a human before it counts as reviewed.

## What a good question looks like

- **Asks for one real example** ("Tell me about a time…", "Describe a situation where…"), not an opinion.
- **Original wording.** Never copy another company's or platform's question list. The company lenses
  (Amazon-style, Google-style, Meta-style) are only tags; do not reproduce their published wording.
- **Probeable.** 3–5 follow-ups that dig where weak answers are thin: what did *you* do, how was it
  measured, how did the other person react, what would you change.
- **Gradable.** Strong-answer signals are the things a hiring committee would look for; red flags are the
  common ways answers go wrong.

## The file

```yaml
title: A conflict with a teammate        # 3–100 chars, unique
competencies: [conflict, teamwork]       # 1–3 of: ownership, conflict, failure, pressure, ambiguity, leadership,
                                         #   feedback, prioritization, learning, customer-focus, judgment,
                                         #   communication, teamwork, adaptability, technical-depth, motivation
lenses: [amazon:earn-trust]              # optional, up to 4 (see LENS_TAGS in packages/shared/src/rounds/competencies.ts)
source: authored
reviewed: false
version: 1
prompt: |
  Tell me about a time you had a real disagreement with a teammate. How did it play out?
follow_ups:                              # 3–5, in the order a scripted interviewer should use them
  - What was the root of the disagreement, from each side's point of view?
  - What did you personally do to resolve it?
  - What would you do differently next time?
strong_signals:                          # 2–6: what a strong answer contains
  - A specific, non-trivial disagreement
  - Represents the other person's view fairly
red_flags:                               # 0–4
  - Casts the teammate as the villain
tips: |                                  # optional coaching shown in the debrief
  Show that you can disagree and still collaborate.
```

## Checklist before you hand it back

1. Could someone answer with a different story each time? Good. Does the question push toward one
   competency, not five?
2. Are the follow-ups questions (ending in `?`), distinct, and specific to this question?
3. Are strong signals observable in a transcript ("states a number") rather than vague ("good communicator")?
4. `pnpm content:validate behavioral/<slug>` passes.
