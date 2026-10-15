# Conventions

A command-line expense tracker. Money is integer cents; dates are `datetime.date`.

## Layout
- `money.py`, `dates.py` — parsing and formatting. All text <-> value conversion happens here.
- `models.py` — frozen dataclasses. `ledger.py` — the in-memory books and every rule about them.
- `budget.py` — limits and what is left. `reports.py` — turns the ledger into summaries and text.
- `storage.py` — the only module that reads or writes files, and the only one that knows the file format.
- `cli.py` — argument handling only. It calls the modules above and prints through the injected `out`.

## Rules
- Never use floats for money. Never parse or format money or dates outside `money.py` / `dates.py`.
- Raise subclasses of `ExpenseError` (in `errors.py`); `cli.py` turns them into a message and exit code 1.
- The storage format has a `version`. Changing what is stored means bumping it **and** still loading older versions.
- Pure functions where possible; take "today" and other context as arguments instead of reading the clock.
- Tests live in `tests/test_<module>.py`; add tests for every public function you add.
