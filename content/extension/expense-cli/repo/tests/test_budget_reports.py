import datetime

import pytest

from expenses.budget import Budget
from expenses.errors import InvalidAmount
from expenses.ledger import Ledger
from expenses.reports import format_report, monthly_summary

D = datetime.date


def make():
    ledger = Ledger()
    ledger.add(500, "food", "a", D(2024, 3, 5))
    ledger.add(300, "fun", "b", D(2024, 3, 6))
    return ledger


def test_budget_lines_show_what_is_left():
    budget = Budget({"food": 2000})
    line = budget.lines(make(), "2024-03")[0]
    assert (line.category, line.spent_cents, line.remaining_cents) == ("food", 500, 1500)


def test_limits_must_be_positive_and_can_be_cleared():
    budget = Budget()
    with pytest.raises(InvalidAmount):
        budget.set_limit("food", 0)
    budget.set_limit("Food", 100)
    assert budget.clear_limit("food") is True and budget.clear_limit("food") is False


def test_summary_and_report_text():
    ledger = make()
    summary = monthly_summary(ledger, "2024-03")
    assert summary == {"month": "2024-03", "total": 800, "by_category": {"food": 500, "fun": 300}, "count": 2}
    text = format_report(summary, Budget({"food": 2000}).lines(ledger, "2024-03"))
    assert text.splitlines() == [
        "Report for 2024-03",
        "Total: $8.00 (2 expenses)",
        "  food: $5.00",
        "  fun: $3.00",
        "  budget food: $15.00 left of $20.00",
    ]
