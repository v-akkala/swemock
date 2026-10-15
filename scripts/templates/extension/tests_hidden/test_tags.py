import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from store import NoteStore  # noqa: E402


def test_acceptance_tags_are_stored_lowercase():
    s = NoteStore()
    assert s.add("x", tags=["Work", "urgent"]).tags == ("work", "urgent")


def test_acceptance_find_is_case_insensitive_and_ordered():
    s = NoteStore()
    a = s.add("a", tags=["Work"])
    s.add("b", tags=["home"])
    c = s.add("c", tags=["work"])
    assert s.find("WORK") == [a, c]
    assert s.find("nothing") == []


def test_regression_untagged_notes_still_work():
    assert NoteStore().add("plain").id == 1
