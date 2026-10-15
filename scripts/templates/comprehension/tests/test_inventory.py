from inventory import Inventory


def test_sell_reduces_stock():
    inv = Inventory({"a": 5})
    assert inv.sell("a", 2)
    assert inv.stock["a"] == 3


def test_restock_adds():
    inv = Inventory({"a": 1})
    inv.restock("a", 4)
    assert inv.stock["a"] == 5
