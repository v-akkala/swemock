import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from store import NoteError, NoteStore  # noqa: E402


def test_add_assigns_ids():
    s = NoteStore()
    assert [s.add("a").id, s.add("b").id] == [1, 2]


def test_empty_text_is_rejected():
    try:
        NoteStore().add("  ")
    except NoteError:
        return
    raise AssertionError("expected NoteError")
