# Brief: author a CS fundamentals question for swemock

You are drafting one question for the CS fundamentals bank used in a mock recruiter screen. Give the
result to the maintainer as a folder `content/cs/<slug>/question.yaml`; it must pass
`pnpm content:validate cs/<slug>` (no Docker needed) and be read by a human before it counts as reviewed.

## What a good question looks like

- **One concept, answerable out loud in 30–90 seconds.** A recruiter or engineer asks it; the candidate
  answers in a few sentences. Not a coding problem, not a design problem.
- **Original wording.** Write the prompt, key points, and model answer yourself. Never copy another
  platform's questions or answer keys. Classic topics (process vs thread, TCP vs UDP) are fine.
- **Fair.** The key points are what a good answer *covers*, not an exact phrasing.
- **Accurate.** Key points must be correct and current. If something is debated or varies by database or
  language, say so in the point ("in the standard definition…", "in CPython…").

## The file

```yaml
title: Process versus thread           # 3–100 chars, unique
difficulty: easy                       # easy | medium | hard
topics: [os]                           # 1–3 of: data-structures, oop, os, concurrency, networking, databases,
                                       #   memory, cpp, python, systems, security, tooling
source: authored
reviewed: false
version: 1
format: short                          # short (the recruiter screen uses these) | mcq
prompt: |
  What is the difference between a process and a thread? When would you pick one over the other?
key_points:                            # 2–8 items; each a full sentence, one idea each
  - A process has its own address space; threads in a process share memory
  - Threads are cheaper to create and switch, but need synchronization
model_answer: |
  A few sentences a candidate could say out loud. At least 15 words.
follow_up: What state is private to each thread?   # optional: one natural follow-up
```

Rules the validator enforces: key points present and distinct; the model answer is not trivially short;
the title and prompt are not duplicates of another question; a `mcq` has 3–5 `options` with exactly one
`correct: true` (MCQs are for the quiz mode; the recruiter screen asks `short` questions only).

An unquoted list item containing `: ` (for example `- Average O(1): hash the key`) is fine; it is read
back as text.

## Difficulty

- **easy**: a definition or comparison most CS graduates know (stack vs heap, TCP vs UDP).
- **medium**: needs a mechanism or a tradeoff (how an index works, deadlock conditions).
- **hard**: needs depth or subtlety (isolation levels, move semantics, virtual memory). Keep these rare:
  the screen asks about four easy, five medium, and three hard questions.

## Checklist before you hand it back

1. Would a strong candidate cover most key points in a minute? If not, split the question.
2. Is every key point correct, and phrased so a self-grader can tell whether they said it?
3. Does the prompt avoid giving away the answer?
4. `pnpm content:validate cs/<slug>` passes.
