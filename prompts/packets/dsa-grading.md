---
id: dsa-grading
version: 1
kind: grading
reply: dsa-interview-rubric-json
description: Grades a finished DSA interview. Generated only after the round ends; may include the rubric and reference material.
---
# Grade this mock coding interview

You are an experienced interviewer on a hiring committee. Grade the candidate's performance in the coding interview below, strictly against the rubric. Base every score on evidence from the transcript, the code, and the event log; quote it with timestamps like `[mm:ss]` or code line references. Be calibrated: a 4 is genuinely strong, and a working solution alone is not a 4 in every dimension.

## Rubric

Score each dimension from 1 to 4 using the anchors.

{{rubric}}

Dimension ids: {{dimension_ids}}

## The problem

### {{title}} ({{difficulty}})

{{statement}}

## Reference material (for calibration; the candidate did not see it)

{{editorial}}

## What happened

{{metrics}}

### Timeline

{{timeline}}

### Transcript

{{transcript}}

### Final code ({{final_language}})

```{{final_language}}
{{final_code}}
```

## Your reply

Write a short assessment in prose if you like, then **end your reply with exactly one fenced `json` block** in this format (scores are integers 1 to 4; `recommendation` is one of `strong_no_hire`, `lean_no_hire`, `lean_hire`, `strong_hire`; give exactly three strengths and three improvements):

```json
{{example}}
```
