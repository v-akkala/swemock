from dataclasses import dataclass

from .errors import InvalidAmount


@dataclass(frozen=True)
class BudgetLine:
    category: str
    limit_cents: int
    spent_cents: int

    @property
    def remaining_cents(self):
        return self.limit_cents - self.spent_cents


@dataclass(frozen=True)
class Alert:
    category: str
    level: str
    spent_cents: int
    limit_cents: int


class Budget:
    """Monthly spending limits per category."""

    def __init__(self, limits=None):
        self.limits = dict(limits or {})

    def set_limit(self, category, cents):
        """Set the monthly limit for a category."""
        if cents <= 0:
            raise InvalidAmount("a budget limit must be greater than zero")
        self.limits[category.strip().lower()] = cents

    def clear_limit(self, category):
        """Remove a limit; returns True if there was one."""
        return self.limits.pop(category.strip().lower(), None) is not None

    def lines(self, ledger, month):
        """One BudgetLine per limited category, sorted by category."""
        return [BudgetLine(c, limit, ledger.total(month, c)) for c, limit in sorted(self.limits.items())]

    def alerts(self, ledger, month, warn_at=0.8):
        """Alerts for categories that are over their limit or close to it, sorted by category."""
        found = []
        for line in self.lines(ledger, month):
            if line.spent_cents > line.limit_cents:
                found.append(Alert(line.category, "over", line.spent_cents, line.limit_cents))
            elif line.spent_cents >= warn_at * line.limit_cents:
                found.append(Alert(line.category, "warning", line.spent_cents, line.limit_cents))
        return found
