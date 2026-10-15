from dataclasses import replace

from .dates import month_key
from .errors import InvalidAmount, UnknownExpense
from .models import Expense


class Ledger:
    """All recorded expenses, kept in memory."""

    def __init__(self):
        self._expenses = {}
        self._next_id = 1

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

    def all(self):
        """Every expense ordered by date, then id."""
        return sorted(self._expenses.values(), key=lambda e: (e.on, e.id))

    def by_month(self, month):
        """Expenses in a 'YYYY-MM' month."""
        return [e for e in self.all() if month_key(e.on) == month]

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
