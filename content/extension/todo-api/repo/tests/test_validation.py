import pytest

from todoapp.errors import ValidationError
from todoapp.validation import clean_new_todo, clean_patch, clean_priority, clean_title, parse_bool


def test_title_is_trimmed():
    assert clean_title("  Buy milk ") == "Buy milk"


@pytest.mark.parametrize("bad", ["", "   ", 5, None, "x" * 121])
def test_bad_titles_are_rejected(bad):
    with pytest.raises(ValidationError) as err:
        clean_title(bad)
    assert err.value.field == "title"


def test_priority_must_be_a_small_int():
    assert clean_priority(5) == 5
    for bad in (0, 6, True, "3"):
        with pytest.raises(ValidationError):
            clean_priority(bad)


def test_new_todo_requires_a_title_and_rejects_unknown_fields():
    assert clean_new_todo({"title": "a"}) == {"title": "a"}
    with pytest.raises(ValidationError):
        clean_new_todo({})
    with pytest.raises(ValidationError) as err:
        clean_new_todo({"title": "a", "colour": "red"})
    assert err.value.field == "colour"


def test_patch_needs_something_to_change():
    with pytest.raises(ValidationError):
        clean_patch({})
    assert clean_patch({"done": True}) == {"done": True}


def test_parse_bool():
    assert parse_bool("TRUE", "done") is True
    assert parse_bool("no", "done") is False
    with pytest.raises(ValidationError):
        parse_bool("maybe", "done")
