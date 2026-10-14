import pytest

from tally import Tally


def test_core_add_and_get():
    t = Tally()
    t.add("a")
    t.add("a", 2)
    assert t.get("a") == 3
    assert t.get("missing") == 0


def test_core_top_orders_by_count():
    t = Tally()
    for key, n in [("x", 1), ("y", 5), ("z", 3)]:
        t.add(key, n)
    assert t.top(2) == [("y", 5), ("z", 3)]


def test_edge_rejects_non_positive():
    with pytest.raises(ValueError):
        Tally().add("a", 0)
