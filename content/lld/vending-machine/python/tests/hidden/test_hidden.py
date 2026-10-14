import pytest

from catalog import (
    InsufficientFundsError,
    InvalidCoinError,
    Inventory,
    Product,
    SoldOutError,
    UnknownProductError,
)
from machine import VendingMachine

CHIPS = Product("A1", "Chips", 75)
SODA = Product("B2", "Soda", 125)
GUM = Product("C3", "Gum", 35)


def stocked(**qty):
    inv = Inventory([CHIPS, SODA, GUM])
    for code, n in qty.items():
        inv.add_stock(code, n)
    return inv


def test_core_exact_payment_gives_no_change():
    m = VendingMachine(stocked(A1=1))
    for c in (25, 25, 25):
        m.insert(c)
    assert m.select("A1") == (CHIPS, [])


def test_core_change_uses_the_fewest_coins_largest_first():
    m = VendingMachine(stocked(C3=1))
    m.insert(100)  # 100 - 35 = 65 = 25 + 25 + 10 + 5
    _, change = m.select("C3")
    assert change == [25, 25, 10, 5]


def test_core_stock_decreases_after_a_sale():
    inv = stocked(A1=1)
    m = VendingMachine(inv)
    m.insert(100)
    m.select("A1")
    assert inv.quantity("A1") == 0
    m.insert(100)
    with pytest.raises(SoldOutError):
        m.select("A1")


def test_core_money_can_be_added_across_several_selects_attempts():
    m = VendingMachine(stocked(B2=1))
    m.insert(100)
    with pytest.raises(InsufficientFundsError) as err:
        m.select("B2")
    assert err.value.needed == 25
    m.insert(25)
    assert m.select("B2") == (SODA, [])


def test_core_a_failed_select_keeps_the_money():
    m = VendingMachine(stocked(A1=1))
    m.insert(25)
    for code, error in (("A1", InsufficientFundsError), ("ZZ", UnknownProductError)):
        with pytest.raises(error):
            m.select(code)
        assert m.balance() == 25
    assert m.cancel() == [25]


def test_core_two_sales_in_a_row_start_from_zero():
    m = VendingMachine(stocked(A1=2))
    m.insert(100)
    m.select("A1")
    assert m.balance() == 0
    m.insert(25)
    with pytest.raises(InsufficientFundsError) as err:
        m.select("A1")
    assert err.value.needed == 50


def test_edge_sold_out_checked_before_funds():
    m = VendingMachine(stocked())
    with pytest.raises(SoldOutError):
        m.select("A1")


def test_edge_cancel_with_nothing_inserted():
    assert VendingMachine(stocked()).cancel() == []


def test_edge_invalid_coins_of_all_kinds():
    m = VendingMachine(stocked())
    for bad in (0, 1, 50, -25, 10.5, "25", None):
        with pytest.raises(InvalidCoinError):
            m.insert(bad)
    assert m.state() == "idle"


def test_edge_unknown_product_error_comes_from_the_provided_catalog():
    with pytest.raises(UnknownProductError):
        VendingMachine(stocked()).select("nope")


def test_core_many_customers():
    inv = stocked(A1=300)
    m = VendingMachine(inv)
    for _ in range(300):
        m.insert(100)
        m.insert(25)
        product, change = m.select("A1")
        assert change == [25, 25]
    assert inv.quantity("A1") == 0
