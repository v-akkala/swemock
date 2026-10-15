from dataclasses import dataclass


class NoteError(Exception):
    """Base class for note errors."""


@dataclass(frozen=True)
class Note:
    id: int
    text: str


class NoteStore:
    def __init__(self):
        self._notes = []

    def add(self, text):
        if not text.strip():
            raise NoteError("text must not be empty")
        note = Note(len(self._notes) + 1, text)
        self._notes.append(note)
        return note

    def all(self):
        return list(self._notes)
