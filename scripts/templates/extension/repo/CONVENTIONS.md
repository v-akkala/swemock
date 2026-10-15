# Conventions

- Layers: `store.py` holds state and rules; nothing else touches the list of notes.
- Naming: functions are verbs, errors are `NoteError` subclasses.
- Validation happens in the store, and invalid input raises `NoteError`.
