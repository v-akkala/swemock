import pytest

from ledger import Ledger
from money import LedgerError


def test_core_an_equal_split_updates_balances():
    ledger = Ledger()
    ledger.add_expense("ann", 3000, ["ann", "bob", "cat"])
    assert ledger.balance("ann") == 2000
    assert ledger.balance("bob") == -1000
    assert ledger.balance("cat") == -1000


def test_core_the_payer_need_not_take_part():
    ledger = Ledger()
    ledger.add_expense("ann", 1000, ["bob", "cat"])
    assert (ledger.balance("ann"), ledger.balance("bob"), ledger.balance("cat")) == (1000, -500, -500)


def test_core_settling_pays_down_a_debt():
    ledger = Ledger()
    ledger.add_expense("ann", 2000, ["ann", "bob"])
    ledger.settle("bob", "ann", 1000)
    assert ledger.balances() == {}


def test_edge_rejects_bad_expenses():
    ledger = Ledger()
    for args in [("a", 0, ["a"]), ("a", -5, ["a"]), ("a", 100, []), ("a", 100, ["a", "a"])]:
        with pytest.raises(LedgerError):
            ledger.add_expense(*args)
