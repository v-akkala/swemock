---
id: fluency-grading
version: 1
kind: grading
reply: fluency-rubric-json
description: Grades a finished AI Fluency round. Generated only after the round ends; includes the rubric, the hidden manifest, and the full assistant log.
---
# Grade this mock {{round_name}} interview

You are an experienced interviewer on a hiring committee. Grade the candidate strictly against the rubric. Several dimensions are marked "(auto)": they were measured from the event log and are given below, so score them to match the measurements, and use the evidence for the others (quote the transcript with timestamps like `[mm:ss]`, or cite files and lines). Be calibrated: a 4 is genuinely strong.

## Rubric

Score each dimension from 1 to 4 using the anchors.

{{rubric}}

Dimension ids: {{dimension_ids}}

## The exercise

{{visible}}

## Hidden manifest (for calibration; the candidate did not see it)

{{hidden}}

## What happened

{{metrics}}

### The candidate's work

{{work}}

### The AI assistant log (every question, what was attached, the reply, and what was applied)

{{assistant_log}}

### Injected mistakes (fallible mode)

{{mutations}}

### Timeline

{{timeline}}

### Transcript

{{transcript}}

## Your reply

Write a short assessment in prose if you like, then **end your reply with exactly one fenced `json` block** in this format (scores are integers 1 to 4; `recommendation` is one of `strong_no_hire`, `lean_no_hire`, `lean_hire`, `strong_hire`; give exactly three strengths and three improvements):

```json
{{example}}
```
