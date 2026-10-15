# Ticket: tags for notes

Notes can have tags. `NoteStore.add(text, tags=())` stores them, and `NoteStore.find(tag)` returns the notes that carry the tag, in the order they were added. Tags are case-insensitive and stored lowercase. Following the repository conventions matters as much as the behavior.

**Acceptance criteria**

- `add(text, tags=["Work", "urgent"])` stores the tags as `("work", "urgent")` on the note.
- `find("WORK")` matches regardless of case.
- Unknown tags give an empty list.
