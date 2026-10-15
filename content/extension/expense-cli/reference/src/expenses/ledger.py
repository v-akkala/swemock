from dataclasses import replace

import datetime

from .dates import month_bounds
from .errors import InvalidAmount, InvalidRule, UnknownExpense
from .models import Expense, RecurringRule
from .recurring import EVERY, occurrences


class Ledger:
    """All recorded expenses, kept in memory."""

    def __init__(self):
        self._expenses = {}
        self._next_id = 1
        self._rules = {}
        self._next_rule_id = 1

    def add(self, amount_cents, category, description, on):
        """Record an expense; returns it."""
        if amount_cents <= 0:
            raise InvalidAmount("amount must be greater than zero")
        expense = Expense(self._next_id, amount_cents, category.strip().lower(), description.strip(), on)
        self._expenses[expense.id] = expense
        self._next_id += 1
        return expense

    def restore(self, expense):
        """Put back an expense loaded from storage, keeping its id."""
        self._expenses[expense.id] = expense
        self._next_id = max(self._next_id, expense.id + 1)

    def remove(self, expense_id):
        """Delete an expense; returns it."""
        try:
            return self._expenses.pop(expense_id)
        except KeyError:
            raise UnknownExpense(f"no expense with id {expense_id}") from None

    def add_recurring(self, amount_cents, category, description, start, every, until=None):
        """Record a recurring rule; returns it."""
        if amount_cents <= 0:
            raise InvalidRule("amount must be greater than zero")
        if every not in EVERY:
            raise InvalidRule(f"every must be one of {', '.join(EVERY)}")
        if until is not None and until < start:
            raise InvalidRule("until must not be before start")
        rule = RecurringRule(self._next_rule_id, amount_cents, category.strip().lower(), description.strip(), start, every, until)
        self._rules[rule.id] = rule
        self._next_rule_id += 1
        return rule

    def restore_recurring(self, rule):
        """Put back a rule loaded from storage, keeping its id."""
        self._rules[rule.id] = rule
        self._next_rule_id = max(self._next_rule_id, rule.id + 1)

    def remove_recurring(self, rule_id):
        """Delete a recurring rule; returns it."""
        try:
            return self._rules.pop(rule_id)
        except KeyError:
            raise UnknownExpense(f"no recurring rule with id {rule_id}") from None

    def recurring(self):
        """Recurring rules ordered by id."""
        return [self._rules[i] for i in sorted(self._rules)]

    def _occurrences(self, first, last):
        found = []
        for rule in self.recurring():
            for day in occurrences(rule, first, last):
                found.append(Expense(0, rule.amount_cents, rule.category, rule.description, day, rule.id))
        return found

    def _between(self, first, last):
        one_off = [e for e in self._expenses.values() if first <= e.on <= last]
        return sorted(one_off + self._occurrences(first, last), key=lambda e: (e.on, e.id, e.rule_id or 0))

    def all(self, through=None):
        """Every expense ordered by date, then id; with `through`, recurring occurrences up to that date too."""
        if through is None:
            return sorted(self._expenses.values(), key=lambda e: (e.on, e.id))
        return self._between(datetime.date.min, through)

    def by_month(self, month):
        """Expenses (including recurring occurrences) in a 'YYYY-MM' month."""
        first, last = month_bounds(month)
        return self._between(first, last)

    def total(self, month, category=None):
        """Cents spent in the month, optionally in one category."""
        return sum(e.amount_cents for e in self.by_month(month) if category in (None, e.category))

    def categories(self, month):
        """Sorted categories used in the month."""
        return sorted({e.category for e in self.by_month(month)})

    def retag(self, expense_id, category):
        """Move an expense to another category; returns the updated expense."""
        expense = self._expenses.get(expense_id)
        if expense is None:
            raise UnknownExpense(f"no expense with id {expense_id}")
        updated = replace(expense, category=category.strip().lower())
        self._expenses[expense_id] = updated
        return updated
