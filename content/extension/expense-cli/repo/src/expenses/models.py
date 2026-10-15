from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Expense:
    id: int
    amount_cents: int
    category: str
    description: str
    on: date
