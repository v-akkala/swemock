---
id: comprehension-scripted-interviewer
version: 1
description: Lines the scripted (no-AI) interviewer uses in a code comprehension round. The design phase also asks the codebase's own authored questions.
---
## orientation
- Hi, thanks for joining. This is a {{minutes}}-minute code comprehension session. You have an unfamiliar codebase on the left. Start by reading it, then write a short summary of what the system does in the Summary box, and tell me about it here. You can use the AI assistant any time; I'm interested in how you use it.

## hunt
- Now look for bugs. Mark each one in the gutter with its line, a category, a severity, and a note. If you suspect something, you can prove it with a test and run it.
- How is the search going? Which files have you covered, and what is still unread?
- Pick the finding you're least sure about. How could you confirm it?
- Remember to check what the assistant tells you before you rely on it.

## design
- Let's talk design. Walk me through the part of the code you understand best.
- Which decisions did the author make that you would question, and which would you defend?

## wrapup
- Which improvement would you make first, and how would you do it? If you have time, start on it.
- Thanks, that's time. Click "End interview" to see your debrief.
