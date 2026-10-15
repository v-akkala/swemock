import pytest

from inventory import Inventory


def test_bug_negative_stock():
    inv = Inventory({"a": 2})
    assert inv.sell("a", 3) is False
    assert inv.stock["a"] == 2


def test_bug_shared_default():
    first, second = Inventory(), Inventory()
    first.restock("a", 1)
    assert second.stock == {}


def test_bug_low_boundary():
    assert Inventory({"a": 3, "b": 4}).low_stock(3) == ["a"]


def test_bug_swallowed():
    with pytest.raises(ValueError):
        Inventory().restock("a", "lots")
