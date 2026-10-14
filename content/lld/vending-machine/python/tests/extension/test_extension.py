import pytest

from catalog import CannotMakeChangeError, Inventory, Product
from machine import VendingMachine

GUM = Product("C3", "Gum", 35)
CHIPS = Product("A1", "Chips", 75)


def stocked():
    inv = Inventory([GUM, CHIPS])
    inv.add_stock("C3", 5)
    inv.add_stock("A1", 5)
    return inv


def test_extension_change_is_paid_from_the_float():
    m = VendingMachine(stocked(), {25: 2, 10: 1, 5: 1})
    m.insert(100)
    _, change = m.select("C3")  # 65 = 25 + 25 + 10 + 5
    assert change == [25, 25, 10, 5]
    assert m.float() == {100: 1, 25: 0, 10: 0, 5: 0}


def test_extension_impossible_change_raises_and_keeps_the_money():
    m = VendingMachine(stocked(), {25: 0, 10: 0, 5: 0})
    m.insert(100)
    with pytest.raises(CannotMakeChangeError):
        m.select("C3")
    assert m.balance() == 100
    assert m.cancel() == [100]


def test_extension_inserted_coins_are_not_used_for_the_same_sale():
    m = VendingMachine(stocked(), {25: 0, 10: 0, 5: 0})
    for _ in range(3):
        m.insert(25)  # 75: exact, no change needed
    assert m.select("A1")[1] == []
    assert m.float()[25] == 3  # the coins join the float after the sale


def test_extension_change_works_when_greedy_would_fail():
    m = VendingMachine(stocked(), {25: 1, 10: 3, 5: 0})
    m.insert(100)
    m.insert(5)
    # 105 - 75 = 30: greedy takes 25 and is stuck at 5 left; the right answer is 10 + 10 + 10
    _, change = m.select("A1")
    assert change == [10, 10, 10]


def test_extension_cancel_does_not_touch_the_float():
    m = VendingMachine(stocked(), {5: 2})
    m.insert(100)
    m.cancel()
    assert m.float()[100] == 0
