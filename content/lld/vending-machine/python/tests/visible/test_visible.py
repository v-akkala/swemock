import pytest

from catalog import InsufficientFundsError, InvalidCoinError, Inventory, Product, SoldOutError, UnknownProductError
from machine import VendingMachine

CHIPS = Product("A1", "Chips", 75)
SODA = Product("B2", "Soda", 125)


def machine():
    inv = Inventory([CHIPS, SODA])
    inv.add_stock("A1", 2)
    inv.add_stock("B2", 1)
    return VendingMachine(inv)


def test_core_insert_accumulates_the_balance_and_state():
    m = machine()
    assert (m.state(), m.balance()) == ("idle", 0)
    m.insert(100)
    m.insert(25)
    assert (m.state(), m.balance()) == ("has_money", 125)


def test_core_select_sells_and_returns_change():
    m = machine()
    m.insert(100)
    m.insert(100)
    product, change = m.select("A1")
    assert product == CHIPS
    assert change == [100, 25]  # 125 back, fewest coins
    assert (m.state(), m.balance()) == ("idle", 0)


def test_core_cancel_returns_the_inserted_coins():
    m = machine()
    for coin in (5, 100, 25, 25):
        m.insert(coin)
    assert m.cancel() == [100, 25, 25, 5]
    assert m.balance() == 0


def test_edge_invalid_coin_changes_nothing():
    m = machine()
    m.insert(25)
    with pytest.raises(InvalidCoinError):
        m.insert(50)
    assert m.balance() == 25
