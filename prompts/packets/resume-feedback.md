---
id: resume-feedback
version: 1
kind: feedback
reply: resume-feedback-json
description: Reviews the resume bullets that drew follow-ups in a recruiter screen and suggests rewrites using only facts the candidate has given.
---
# Resume feedback after a mock recruiter screen

You are an experienced recruiter. Below are my resume and the transcript of a mock screen that probed it. Identify the bullets that **drew hard follow-ups or that I could not back up**, explain what was weak about each, and suggest a rewrite.

## Rules

- Use **only facts that appear in my resume or in my answers in the transcript**. Never invent a number, a technology, a team size, or an outcome. If a better bullet would need a fact I haven't given, say so in `needs_from_candidate` and keep the rewrite honest without it.
- Prefer concrete verbs, my own contribution, and measured results *when I actually provided them*.
- Pick between 1 and 6 bullets, the ones that matter most.

## My resume ({{resume_title}})

<resume>
{{resume}}
</resume>

## Bullets the recruiter probed

{{probes}}

## Transcript

{{transcript}}

## Your reply

Write a short note in prose if you like, then **end your reply with exactly one fenced `json` block** in this format (`could_back_up` is `yes`, `partly`, or `no`):

```json
{{example}}
```
