import json

from .budget import Budget
from .dates import parse_date
from .errors import StorageError
from .ledger import Ledger
from .models import Expense

VERSION = 1


def save(ledger, budget, path):
    """Write the ledger and budget to a JSON file."""
    data = {
        "version": VERSION,
        "expenses": [
            {"id": e.id, "amount_cents": e.amount_cents, "category": e.category, "description": e.description, "on": e.on.isoformat()}
            for e in ledger.all()
        ],
        "budget": dict(sorted(budget.limits.items())),
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def load(path):
    """Read a file written by `save`; a missing file gives empty books. Returns (ledger, budget)."""
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return Ledger(), Budget()
    except (OSError, ValueError) as error:
        raise StorageError(f"cannot read {path}: {error}") from None
    if data.get("version") != VERSION:
        raise StorageError(f"unsupported file version: {data.get('version')!r}")
    ledger = Ledger()
    for row in data.get("expenses", []):
        ledger.restore(Expense(row["id"], row["amount_cents"], row["category"], row["description"], parse_date(row["on"])))
    return ledger, Budget(data.get("budget", {}))
