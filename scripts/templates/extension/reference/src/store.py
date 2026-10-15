from dataclasses import dataclass


class NoteError(Exception):
    """Base class for note errors."""


@dataclass(frozen=True)
class Note:
    id: int
    text: str
    tags: tuple = ()


class NoteStore:
    def __init__(self):
        self._notes = []

    def add(self, text, tags=()):
        if not text.strip():
            raise NoteError("text must not be empty")
        note = Note(len(self._notes) + 1, text, tuple(t.lower() for t in tags))
        self._notes.append(note)
        return note

    def find(self, tag):
        wanted = tag.lower()
        return [n for n in self._notes if wanted in n.tags]

    def all(self):
        return list(self._notes)
