import pytest

from ledger import Ledger
from money import LedgerError


def test_extension_a_percentage_split_follows_the_weights():
    ledger = Ledger()
    ledger.add_expense("ann", 10000, percentages={"ann": 50, "bob": 30, "cat": 20})
    assert (ledger.balance("ann"), ledger.balance("bob"), ledger.balance("cat")) == (5000, -3000, -2000)


def test_extension_rounding_never_loses_a_cent_and_follows_the_largest_remainder():
    ledger = Ledger()
    ledger.add_expense("zed", 100, percentages={"amy": 33, "bea": 33, "cyd": 34})  # 33, 33, 34 exactly
    assert (ledger.balance("amy"), ledger.balance("bea"), ledger.balance("cyd")) == (-33, -33, -34)
    other = Ledger()
    other.add_expense("zed", 101, percentages={"amy": 50, "bea": 50})  # 50.5 each: leftover goes to amy (name order)
    assert (other.balance("amy"), other.balance("bea")) == (-51, -50)
    assert sum(other.balances().values()) == 0


def test_extension_percentages_must_total_one_hundred_and_be_positive():
    ledger = Ledger()
    for bad in [{"a": 50, "b": 40}, {"a": 60, "b": 60}, {"a": 100, "b": 0}, {}]:
        with pytest.raises(LedgerError):
            ledger.add_expense("a", 100, percentages=bad)
    assert ledger.balances() == {}


def test_extension_the_equal_split_still_works_and_both_forms_mix():
    ledger = Ledger()
    ledger.add_expense("ann", 600, ["ann", "bob"])
    ledger.add_expense("bob", 1000, percentages={"ann": 70, "bob": 30})
    assert ledger.balance("ann") == 300 - 700
    assert ledger.balance("bob") == -300 + 1000 - 300
