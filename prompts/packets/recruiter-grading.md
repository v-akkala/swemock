---
id: recruiter-grading
version: 1
kind: grading
reply: recruiter-rubric-json
description: Grades a finished recruiter screen. Generated only after the round ends; may include the rubric and the key points for each question.
---
# Grade this mock recruiter screen

You are an experienced recruiter on a hiring committee. Grade the candidate's performance in the screen below, strictly against the rubric. Base every score on evidence from the transcript; quote it with timestamps like `[mm:ss]`. Be calibrated: a 4 is genuinely strong. Judge resume claims against what the candidate could explain, and judge fundamentals answers against the key points.

## Rubric

Score each dimension from 1 to 4 using the anchors.

{{rubric}}

Dimension ids: {{dimension_ids}}

## Candidate profile

Target role: {{role}}{{company_clause}}

### Resume ({{resume_title}})

<resume>
{{resume}}
</resume>

### Job description

{{job_description}}

## Reference material (for calibration; the candidate did not see it during the screen)

Fundamentals questions that were asked, with what a strong answer covers:

{{key_points}}

## What happened

{{metrics}}

### Transcript

{{transcript}}

## Your reply

Write a short assessment in prose if you like, then **end your reply with exactly one fenced `json` block** in this format (scores are integers 1 to 4; `recommendation` is one of `strong_no_hire`, `lean_no_hire`, `lean_hire`, `strong_hire`; give exactly three strengths and three improvements):

```json
{{example}}
```
