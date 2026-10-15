import pytest

from todoapp.errors import ValidationError
from todoapp.filters import Filters, apply_filters, parse_filters
from todoapp.models import Todo


def todos():
    return [Todo(1, "Buy milk", True, 1), Todo(2, "Walk dog", False, 3), Todo(3, "Buy bread", False, 3)]


def test_no_filters_returns_everything():
    assert apply_filters(todos(), parse_filters({})) == todos()


def test_combined_filters():
    result = apply_filters(todos(), Filters(done=False, q="buy"))
    assert [t.id for t in result] == [3]


def test_repeated_parameters_are_rejected():
    with pytest.raises(ValidationError):
        parse_filters({"done": ["true", "false"]})


def test_priority_must_be_an_integer():
    with pytest.raises(ValidationError):
        parse_filters({"priority": ["high"]})
