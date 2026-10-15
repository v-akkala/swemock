# Ticket: recurring expenses and budget alerts

Rent and subscriptions show up every month and nobody wants to type them in. And a budget is only useful if it tells you when you are close to it.

**Recurring expenses**

- `Ledger.add_recurring(amount_cents, category, description, start, every, until=None)` records a rule and returns a `RecurringRule` (frozen; fields `id, amount_cents, category, description, start, every, until`). Category and description are normalized like `add`. Rule ids are their own sequence starting at 1.
- `every` is `"weekly"` or `"monthly"`. Anything else, a non-positive amount, or `until` before `start` raises the new `InvalidRule` (an `ExpenseError`).
- A weekly rule fires every 7 days from `start`. A monthly rule fires on `start`'s day of the month, or on the month's last day if it is shorter, without drifting: 31 January gives 31 Jan, 29 Feb (2024), 31 Mar. `until` is inclusive.
- Occurrences are not stored. `Ledger.all(through=None)` is unchanged without arguments. With `through=<date>` it also returns the occurrences on or before that date, as `Expense` objects with `id=0` and a new `rule_id` field, ordered by date then id.
- `by_month`, `total`, `categories`, `monthly_summary` and the report include the occurrences that fall in that month, with no extra argument.
- `Ledger.recurring()` lists the rules by id. `Ledger.remove_recurring(rule_id)` removes one and returns it (unknown ids raise `UnknownExpense`).

**Budget alerts**

- `Budget.alerts(ledger, month, warn_at=0.8)` returns `Alert(category, level, spent_cents, limit_cents)` for categories with a limit, sorted by category: level `"over"` when spent is more than the limit, `"warning"` when spent is at least `warn_at` of the limit (up to and including the limit), and no alert otherwise.
- `format_report(summary, budget_lines=(), alerts=())` appends one line per alert after the budget lines: `OVER food: $120.00 of $100.00` or `WARNING food: $85.00 of $100.00`.

**Storage and CLI**

- The file format becomes version 2 and stores the rules. Version 1 files must still load.
- `expenses recur <amount> <category> <weekly|monthly> <start> [description...]` adds a rule, saves, and prints `recurring #<id> <every> from <start>`.
- `expenses report <month>` shows the alerts.

Follow `CONVENTIONS.md` and add tests.
