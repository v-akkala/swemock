from .money import format_amount


def monthly_summary(ledger, month):
    """Totals for a month: overall, per category, and the number of expenses."""
    expenses = ledger.by_month(month)
    by_category = {}
    for expense in expenses:
        by_category[expense.category] = by_category.get(expense.category, 0) + expense.amount_cents
    return {"month": month, "total": sum(by_category.values()), "by_category": by_category, "count": len(expenses)}


def format_report(summary, budget_lines=()):
    """The text of a monthly report."""
    lines = [f"Report for {summary['month']}", f"Total: {format_amount(summary['total'])} ({summary['count']} expenses)"]
    for category, cents in sorted(summary["by_category"].items()):
        lines.append(f"  {category}: {format_amount(cents)}")
    for line in budget_lines:
        lines.append(f"  budget {line.category}: {format_amount(line.remaining_cents)} left of {format_amount(line.limit_cents)}")
    return "\n".join(lines)
