import datetime
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from expenses import storage  # noqa: E402
from expenses.budget import Budget  # noqa: E402
from expenses.cli import main  # noqa: E402
from expenses.errors import InvalidRule, UnknownExpense  # noqa: E402
from expenses.ledger import Ledger  # noqa: E402
from expenses.reports import format_report, monthly_summary  # noqa: E402

D = datetime.date


def days(expenses):
    return [e.on for e in expenses]


def test_acceptance_monthly_rules_clamp_without_drifting():
    ledger = Ledger()
    ledger.add_recurring(1000, "rent", "flat", D(2024, 1, 31), "monthly")
    assert days(ledger.all(through=D(2024, 4, 30))) == [D(2024, 1, 31), D(2024, 2, 29), D(2024, 3, 31), D(2024, 4, 30)]


def test_acceptance_non_leap_february_and_year_rollover():
    ledger = Ledger()
    ledger.add_recurring(500, "gym", "", D(2023, 11, 30), "monthly")
    assert days(ledger.all(through=D(2024, 3, 1))) == [D(2023, 11, 30), D(2023, 12, 30), D(2024, 1, 30), D(2024, 2, 29)]


def test_acceptance_weekly_rules_and_inclusive_until():
    ledger = Ledger()
    ledger.add_recurring(300, "coffee", "", D(2024, 3, 1), "weekly", until=D(2024, 3, 22))
    assert days(ledger.all(through=D(2024, 12, 31))) == [D(2024, 3, 1), D(2024, 3, 8), D(2024, 3, 15), D(2024, 3, 22)]


def test_acceptance_all_without_through_is_unchanged():
    ledger = Ledger()
    ledger.add(100, "food", "a", D(2024, 3, 2))
    ledger.add_recurring(500, "rent", "", D(2024, 3, 1), "monthly")
    assert [e.category for e in ledger.all()] == ["food"]


def test_acceptance_occurrences_are_expenses_with_a_rule_id():
    ledger = Ledger()
    ledger.add(100, "food", "a", D(2024, 3, 1))
    rule = ledger.add_recurring(500, "Rent", " flat ", D(2024, 3, 2), "monthly")
    found = ledger.all(through=D(2024, 3, 31))
    assert [(e.id, e.rule_id, e.category, e.description) for e in found] == [(1, None, "food", "a"), (0, rule.id, "rent", "flat")]


def test_acceptance_months_totals_and_summary_include_recurring():
    ledger = Ledger()
    ledger.add(2500, "food", "a", D(2024, 3, 5))
    ledger.add_recurring(100000, "rent", "flat", D(2024, 1, 15), "monthly")
    assert ledger.total("2024-03") == 102500
    assert ledger.total("2024-03", "rent") == 100000
    assert ledger.categories("2024-03") == ["food", "rent"]
    assert ledger.total("2023-12") == 0
    summary = monthly_summary(ledger, "2024-03")
    assert summary["total"] == 102500 and summary["count"] == 2 and summary["by_category"]["rent"] == 100000


def test_acceptance_rule_validation():
    ledger = Ledger()
    for args in (
        (0, "x", "", D(2024, 1, 1), "monthly"),
        (100, "x", "", D(2024, 1, 1), "daily"),
    ):
        with pytest.raises(InvalidRule):
            ledger.add_recurring(*args)
    with pytest.raises(InvalidRule):
        ledger.add_recurring(100, "x", "", D(2024, 2, 1), "weekly", until=D(2024, 1, 1))


def test_acceptance_rules_can_be_listed_and_removed():
    ledger = Ledger()
    a = ledger.add_recurring(100, "a", "", D(2024, 1, 1), "weekly")
    b = ledger.add_recurring(200, "b", "", D(2024, 1, 1), "monthly")
    assert [r.id for r in ledger.recurring()] == [1, 2]
    assert ledger.remove_recurring(a.id) == a
    assert ledger.recurring() == [b]
    assert ledger.total("2024-01", "a") == 0
    with pytest.raises(UnknownExpense):
        ledger.remove_recurring(99)


def test_acceptance_alert_levels_and_thresholds():
    ledger = Ledger()
    ledger.add(8500, "food", "", D(2024, 3, 5))
    ledger.add(10000, "fun", "", D(2024, 3, 5))
    ledger.add(12000, "travel", "", D(2024, 3, 5))
    ledger.add(7900, "gifts", "", D(2024, 3, 5))
    ledger.add(99999, "other", "", D(2024, 3, 5))
    budget = Budget({"food": 10000, "fun": 10000, "travel": 10000, "gifts": 10000})
    found = budget.alerts(ledger, "2024-03")
    assert [(a.category, a.level, a.spent_cents, a.limit_cents) for a in found] == [
        ("food", "warning", 8500, 10000),
        ("fun", "warning", 10000, 10000),
        ("travel", "over", 12000, 10000),
    ]
    assert [a.category for a in budget.alerts(ledger, "2024-03", warn_at=0.5)] == ["food", "fun", "gifts", "travel"]


def test_acceptance_alerts_count_recurring_spending():
    ledger = Ledger()
    ledger.add_recurring(9000, "food", "", D(2024, 3, 1), "weekly")
    budget = Budget({"food": 20000})
    assert [(a.level, a.spent_cents) for a in budget.alerts(ledger, "2024-03")] == [("over", 45000)]


def test_acceptance_report_shows_alert_lines():
    ledger = Ledger()
    ledger.add(12000, "food", "", D(2024, 3, 5))
    budget = Budget({"food": 10000})
    text = format_report(monthly_summary(ledger, "2024-03"), budget.lines(ledger, "2024-03"), budget.alerts(ledger, "2024-03"))
    assert text.splitlines()[-1] == "OVER food: $120.00 of $100.00"


def test_acceptance_storage_is_version_two_and_reads_version_one(tmp_path):
    path = tmp_path / "books.json"
    ledger = Ledger()
    rule = ledger.add_recurring(1000, "rent", "flat", D(2024, 1, 31), "monthly", D(2024, 12, 31))
    ledger.add(100, "food", "", D(2024, 1, 2))
    storage.save(ledger, Budget({"food": 500}), path)
    assert '"version": 2' in path.read_text()
    loaded, budget = storage.load(path)
    assert loaded.recurring() == [rule] and budget.limits == {"food": 500}
    assert loaded.add_recurring(5, "x", "", D(2024, 1, 1), "weekly").id == 2
    old = tmp_path / "old.json"
    old.write_text('{"version": 1, "expenses": [], "budget": {}}')
    assert storage.load(old)[0].recurring() == []


def test_acceptance_cli_recur_and_report(tmp_path):
    path = str(tmp_path / "books.json")
    lines = []
    assert main(["recur", "1200", "rent", "monthly", "2024-01-31", "the", "flat"], path, out=lines.append) == 0
    assert lines == ["recurring #1 monthly from 2024-01-31"]
    main(["budget", "set", "rent", "1000"], path, out=lambda _: None)
    lines.clear()
    assert main(["report", "2024-02"], path, out=lines.append) == 0
    assert "Total: $1200.00 (1 expenses)" in lines[0]
    assert lines[0].splitlines()[-1] == "OVER rent: $1200.00 of $1000.00"
    assert main(["recur", "5", "x", "daily", "2024-01-01"], path, out=lines.append) == 1


def test_regression_one_off_flow_and_report_format(tmp_path):
    path = str(tmp_path / "books.json")
    lines = []
    main(["add", "30", "food", "2024-03-05", "lunch"], path, out=lines.append)
    main(["budget", "set", "food", "100"], path, out=lines.append)
    lines.clear()
    main(["report", "2024-03"], path, out=lines.append)
    assert lines[0].splitlines() == [
        "Report for 2024-03",
        "Total: $30.00 (1 expenses)",
        "  food: $30.00",
        "  budget food: $70.00 left of $100.00",
    ]


def test_regression_ledger_basics():
    ledger = Ledger()
    first = ledger.add(100, "Food", "x", D(2024, 3, 9))
    ledger.add(200, "food", "y", D(2024, 3, 1))
    assert [e.on for e in ledger.all()] == [D(2024, 3, 1), D(2024, 3, 9)]
    assert ledger.remove(first.id) == first
    assert ledger.total("2024-03") == 200
