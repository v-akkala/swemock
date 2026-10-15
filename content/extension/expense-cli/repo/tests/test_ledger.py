import datetime

import pytest

from expenses.errors import InvalidAmount, UnknownExpense
from expenses.ledger import Ledger

D = datetime.date


def test_add_normalizes_and_orders_by_date():
    ledger = Ledger()
    ledger.add(500, " Food ", " lunch ", D(2024, 3, 5))
    ledger.add(900, "travel", "bus", D(2024, 3, 1))
    assert [e.category for e in ledger.all()] == ["travel", "food"]
    assert ledger.all()[1].description == "lunch"


def test_totals_by_month_and_category():
    ledger = Ledger()
    ledger.add(500, "food", "a", D(2024, 3, 5))
    ledger.add(700, "food", "b", D(2024, 3, 9))
    ledger.add(900, "fun", "c", D(2024, 4, 1))
    assert ledger.total("2024-03") == 1200
    assert ledger.total("2024-03", "food") == 1200
    assert ledger.total("2024-04", "food") == 0
    assert ledger.categories("2024-03") == ["food"]


def test_remove_and_unknown_ids():
    ledger = Ledger()
    expense = ledger.add(100, "x", "", D(2024, 1, 1))
    assert ledger.remove(expense.id) == expense
    with pytest.raises(UnknownExpense):
        ledger.remove(expense.id)


def test_amount_must_be_positive():
    with pytest.raises(InvalidAmount):
        Ledger().add(0, "x", "", D(2024, 1, 1))


def test_retag():
    ledger = Ledger()
    expense = ledger.add(100, "x", "", D(2024, 1, 1))
    assert ledger.retag(expense.id, "Y").category == "y"
