---
id: review-scripted-interviewer
version: 1
description: Lines the scripted (no-AI) interviewer uses when the candidate reviews an AI-generated pull request.
---
## intro
- Hi, thanks for joining. This is a {{minutes}}-minute code review. An AI agent opened the pull request in front of you. Treat it like a teammate's PR: read the description, the diff, and the surrounding code, leave comments on the lines that matter, and end with a decision: approve, request changes, or reject. Tell me when you're ready.

## review
- Walk me through what this PR claims to do, and whether the diff does it.
- What happens at the edges: empty input, large input, bad input, unicode, concurrency?
- Do the tests actually test the change? Would they fail if the code were wrong?
- Is there anything in the diff that the description doesn't mention, or that doesn't belong in this PR?
- If you want to check something, run the tests or open the branch in the editor with "Fix it".

## decision
- What is your decision, and what is the one comment the author must act on?
- Which of your comments are blocking, and which are nits?
- Thanks, that's time. Click "End interview" to see your debrief.
