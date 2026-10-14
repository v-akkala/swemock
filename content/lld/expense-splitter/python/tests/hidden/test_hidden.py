import pytest

from ledger import Ledger
from money import LedgerError


def test_core_uneven_amounts_never_lose_a_cent():
    ledger = Ledger()
    ledger.add_expense("ann", 1000, ["ann", "bob", "cat"])  # 334 + 333 + 333
    assert ledger.balance("ann") == 1000 - 334
    assert ledger.balance("bob") == -333
    assert ledger.balance("cat") == -333
    assert sum(ledger.balances().values()) == 0


def test_core_the_extra_cents_follow_the_participant_order():
    a, b = Ledger(), Ledger()
    a.add_expense("x", 101, ["bob", "cat"])
    b.add_expense("x", 101, ["cat", "bob"])
    assert (a.balance("bob"), a.balance("cat")) == (-51, -50)
    assert (b.balance("bob"), b.balance("cat")) == (-50, -51)


def test_core_expenses_accumulate_across_the_group():
    ledger = Ledger()
    ledger.add_expense("ann", 3000, ["ann", "bob", "cat"])
    ledger.add_expense("bob", 1200, ["ann", "bob"])
    ledger.add_expense("cat", 600, ["ann", "bob", "cat"])
    assert ledger.balances() == {"ann": 2000 - 600 - 200, "bob": -1000 + 600 - 200, "cat": -1000 + 400}
    assert sum(ledger.balances().values()) == 0


def test_core_balances_lists_only_non_zero_users():
    ledger = Ledger()
    ledger.add_expense("ann", 200, ["ann", "bob"])
    ledger.settle("bob", "ann", 100)
    assert ledger.balances() == {}
    assert ledger.balance("nobody") == 0


def test_core_settling_more_than_owed_flips_the_balance():
    ledger = Ledger()
    ledger.add_expense("ann", 200, ["ann", "bob"])
    ledger.settle("bob", "ann", 250)
    assert ledger.balance("bob") == 150
    assert ledger.balance("ann") == -150


def test_core_simplify_matches_the_biggest_debtor_with_the_biggest_creditor():
    ledger = Ledger()
    ledger.add_expense("ann", 3000, ["ann", "bob", "cat"])
    ledger.add_expense("dan", 900, ["bob", "cat", "dan"])
    # balances: ann +2000, bob -1300, cat -1300, dan +600
    assert ledger.simplify() == [("bob", "ann", 1300), ("cat", "ann", 700), ("cat", "dan", 600)]


def test_core_simplify_breaks_ties_by_name_and_leaves_the_ledger_alone():
    ledger = Ledger()
    ledger.add_expense("zed", 400, ["amy", "bea", "zed"])  # amy -134? uneven: shares 134,133,133
    before = ledger.balances()
    transfers = ledger.simplify()
    assert ledger.balances() == before
    assert transfers == [("amy", "zed", 134), ("bea", "zed", 133)]
    # applying the transfers settles everyone
    for debtor, creditor, amount in transfers:
        ledger.settle(debtor, creditor, amount)
    assert ledger.balances() == {}


def test_core_simplify_uses_at_most_n_minus_one_transfers():
    ledger = Ledger()
    people = [f"p{i:02d}" for i in range(12)]
    for i, payer in enumerate(people):
        ledger.add_expense(payer, 1000 + 37 * i, people)
    transfers = ledger.simplify()
    assert len(transfers) <= len(people) - 1
    for debtor, creditor, amount in transfers:
        ledger.settle(debtor, creditor, amount)
    assert ledger.balances() == {}


def test_edge_simplify_of_an_empty_or_settled_ledger_is_empty():
    ledger = Ledger()
    assert ledger.simplify() == []
    ledger.add_expense("a", 100, ["a"])
    assert ledger.simplify() == []


def test_edge_a_failed_call_changes_nothing():
    ledger = Ledger()
    ledger.add_expense("ann", 300, ["ann", "bob", "cat"])
    before = ledger.balances()
    for call in (
        lambda: ledger.add_expense("ann", 100, ["bob", "bob"]),
        lambda: ledger.add_expense("ann", -1, ["bob"]),
        lambda: ledger.settle("bob", "bob", 10),
        lambda: ledger.settle("bob", "ann", 0),
    ):
        with pytest.raises(LedgerError):
            call()
    assert ledger.balances() == before


def test_edge_single_participant_who_is_the_payer_changes_nothing():
    ledger = Ledger()
    ledger.add_expense("ann", 500, ["ann"])
    assert ledger.balances() == {}


def test_core_many_expenses():
    ledger = Ledger()
    people = [f"u{i}" for i in range(30)]
    for n in range(2000):
        ledger.add_expense(people[n % 30], 100 + n, people[: 2 + n % 28])
    assert sum(ledger.balances().values()) == 0
