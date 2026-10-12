---
id: behavioral-rewrite
version: 1
kind: feedback
reply: behavioral-rewrite-json
description: Rewrites each behavioral answer into a stronger version using only the facts the candidate actually gave, and lists the facts that are missing.
---
# Stronger versions of my behavioral answers

Below is the transcript of a mock behavioral interview. For **each question I answered**, write a stronger version of my answer and list what's missing.

## Rules (important)

- Use **only facts that appear in my answers in the transcript or in my story notes below**. Never invent a number, a name, a team size, a date, or an outcome. If a stronger answer needs a fact I didn't give, leave it out of the rewrite and list it in `missing_facts` (for example "the size of the improvement", "what you personally decided").
- Write in the first person, as I would say it, in about two to three minutes of speech (250–400 words at most).
- Use a clear structure: brief situation, my task, what **I** did, the result, and one reflection, as far as the facts allow.
- `question` is the interviewer's question, shortened to a sentence.

## Story notes I wrote (facts I have confirmed)

{{stories}}

## Transcript

{{transcript}}

## Your reply

Write a short note in prose if you like, then **end your reply with exactly one fenced `json` block** in this format:

```json
{{example}}
```
