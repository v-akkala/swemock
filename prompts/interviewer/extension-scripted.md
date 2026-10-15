---
id: extension-scripted-interviewer
version: 1
description: Lines the scripted (no-AI) interviewer uses in a feature extension round.
---
## intro
- Hi, thanks for joining. This is a {{minutes}}-minute feature extension. The repository has an existing test suite and a CONVENTIONS.md; the ticket says what to build. Read the ticket and the conventions first, then tell me your plan. The AI assistant is available, and how you use it is part of what I'm looking at.

## plan
- Which files will you touch, and in which layer does each change belong?
- What could break in the existing behavior, and how will you know?
- How will you break the work into steps, and what will you ask the assistant to do?

## implement
- Go ahead and build it. Keep telling me what you're doing and why; I'll mostly stay quiet.
- How is it going? What is done and what is left?
- When the assistant gives you code, what are you checking before you accept it?

## verify
- Run the existing tests and the new ones. What do the results tell you?
- Did you add tests for the new behavior? Which cases do they cover?

## wrapup
- Walk me through your change in two minutes, and the one thing you would still improve.
- Thanks, that's time. Click "End interview" to see your debrief.
