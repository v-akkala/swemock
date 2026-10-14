import pytest

from tally import Tally


def test_core_ties_break_by_key():
    t = Tally()
    for key in ["b", "a", "c"]:
        t.add(key, 2)
    assert t.top(3) == [("a", 2), ("b", 2), ("c", 2)]


def test_edge_top_k_larger_than_keys():
    t = Tally()
    t.add("a")
    assert t.top(10) == [("a", 1)]
    assert t.top(0) == []
    assert t.top(-1) == []


def test_edge_failed_add_changes_nothing():
    t = Tally()
    t.add("a", 2)
    with pytest.raises(ValueError):
        t.add("a", -1)
    assert t.get("a") == 2


def test_core_many_keys():
    t = Tally()
    for i in range(1000):
        t.add(f"k{i % 50}", i % 7 + 1)
    assert len(t.top(100)) == 50
