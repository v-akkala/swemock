from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(frozen=True)
class Expense:
    id: int
    amount_cents: int
    category: str
    description: str
    on: date
    rule_id: Optional[int] = None


@dataclass(frozen=True)
class RecurringRule:
    id: int
    amount_cents: int
    category: str
    description: str
    start: date
    every: str
    until: Optional[date] = None
