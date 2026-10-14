import pytest

from tally import Tally


def test_extension_remove_decrements():
    t = Tally()
    t.add("a", 3)
    t.remove("a")
    assert t.get("a") == 2


def test_extension_remove_drops_zero_keys():
    t = Tally()
    t.add("a", 2)
    t.remove("a", 2)
    assert t.get("a") == 0
    assert t.top(5) == []


def test_extension_remove_too_much_raises():
    t = Tally()
    t.add("a")
    with pytest.raises(KeyError):
        t.remove("a", 2)
    with pytest.raises(KeyError):
        t.remove("never")
    assert t.get("a") == 1
