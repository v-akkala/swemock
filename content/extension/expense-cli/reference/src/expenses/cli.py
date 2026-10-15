from . import storage
from .budget import Budget
from .dates import parse_date, parse_month
from .errors import ExpenseError
from .money import format_amount, parse_amount
from .reports import format_report, monthly_summary

USAGE = (
    "usage: expenses add <amount> <category> <date> [description...]\n"
    "       expenses list [month]\n"
    "       expenses recur <amount> <category> <weekly|monthly> <start> [description...]\n"
    "       expenses remove <id>\n"
    "       expenses report <month>\n"
    "       expenses budget set <category> <amount>"
)


def _describe(expense):
    return f"#{expense.id} {expense.on.isoformat()} {expense.category} {format_amount(expense.amount_cents)} {expense.description}".rstrip()


def main(argv, path, out=print):
    """Run one command against the books stored at `path`; returns the exit code."""
    try:
        return _run(argv, path, out)
    except ExpenseError as error:
        out(f"error: {error}")
        return 1


def _run(argv, path, out):
    if not argv:
        out(USAGE)
        return 2
    ledger, budget = storage.load(path)
    command, args = argv[0], argv[1:]
    if command == "add" and len(args) >= 3:
        expense = ledger.add(parse_amount(args[0]), args[1], " ".join(args[3:]), parse_date(args[2]))
        storage.save(ledger, budget, path)
        out(f"added #{expense.id}")
    elif command == "list" and len(args) <= 1:
        expenses = ledger.by_month(parse_month(args[0])) if args else ledger.all()
        for expense in expenses:
            out(_describe(expense))
    elif command == "recur" and len(args) >= 4:
        start = parse_date(args[3])
        rule = ledger.add_recurring(parse_amount(args[0]), args[1], " ".join(args[4:]), start, args[2])
        storage.save(ledger, budget, path)
        out(f"recurring #{rule.id} {rule.every} from {start.isoformat()}")
    elif command == "remove" and len(args) == 1:
        removed = ledger.remove(int(args[0]))
        storage.save(ledger, budget, path)
        out(f"removed #{removed.id}")
    elif command == "report" and len(args) == 1:
        month = parse_month(args[0])
        out(format_report(monthly_summary(ledger, month), budget.lines(ledger, month), budget.alerts(ledger, month)))
    elif command == "budget" and len(args) == 3 and args[0] == "set":
        budget.set_limit(args[1], parse_amount(args[2]))
        storage.save(ledger, budget, path)
        out(f"budget for {args[1].lower()} set to {format_amount(budget.limits[args[1].strip().lower()])}")
    else:
        out(USAGE)
        return 2
    return 0
