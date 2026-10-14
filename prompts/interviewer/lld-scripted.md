---
id: lld-scripted-interviewer
version: 1
description: Lines the scripted (no-AI) interviewer uses in a low-level design round. One section per phase; each candidate message gets the next line of the current phase. The requirement change and the problem's follow-ups come from the problem itself.
---
## intro
- Hi, thanks for joining. This is a {{minutes}}-minute low-level design interview. Read the spec on the left, then talk me through your thinking in this chat as you go: what you assume, how you split the code up, and why. Tell me when you're ready.

## design
- Before you code: what are the main classes or modules, and what is each one responsible for?
- Which parts of this are most likely to change, and how does your design keep those changes cheap?
- What can go wrong at the edges (bad input, empty state, conflicts), and where will you handle it?
- What are the time complexities of the key operations, and does that matter here?

## implement
- Go ahead and implement it. Keep narrating your key decisions here; I'll mostly stay quiet. Run the visible tests as you go.
- How is it going? Which parts are done and which are left?
- Remember to run the tests, and to read any failure message before changing code.

## change
- Take a moment to think about how this changes your design before you edit. What stays the same, and what has to move?
- Did the change fit into your design cleanly? If you had to bend something, what would you restructure?

## wrapup
- Walk me through your final design in two minutes: the main pieces and how they interact.
- If you had another hour, what would you improve first?
- Thanks, that's time. Click "End interview" to see your debrief.
