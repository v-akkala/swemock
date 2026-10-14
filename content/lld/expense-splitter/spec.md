# Expense Splitter

A group shares costs: one person pays, and everyone involved owes their share. Implement the ledger that tracks who owes whom.

`money.py` (file 1) is provided: it works in **whole cents** and has the rounding helper. Implement `ledger.py` (file 2).

## Provided (money.py)

- `split_evenly(total_cents, n) -> list[int]`: shares for `n` people that add up to exactly `total_cents`; when it doesn't divide evenly, the first `total_cents % n` shares get one extra cent.
- `format_cents(cents) -> str`: for example `"12.50"`.
- `LedgerError(Exception)`: the error type to raise for invalid operations.

## API of `Ledger`

- `add_expense(payer, amount, participants)`: `payer` paid `amount` cents for the group. The cost is split **equally** among `participants` (a list of names, which may or may not include the payer). Shares are computed with `split_evenly` over the participants **in the order given**. Raise `LedgerError` if `amount` is not positive, if `participants` is empty or contains duplicates.
- `balance(user) -> int`: the net balance in cents: **positive means the user is owed money, negative means the user owes**. A user the ledger has never seen has balance 0.
- `balances() -> dict`: every user with a non-zero balance. The balances always sum to zero.
- `settle(payer, receiver, amount)`: `payer` hands `amount` cents to `receiver` to pay down a debt. Raise `LedgerError` if `amount` is not positive or the two users are the same person.
- `simplify() -> list[tuple[str, str, int]]`: a list of `(debtor, creditor, amount)` transfers that would bring every balance to zero. Greedy: repeatedly match the user who owes the most with the user who is owed the most and transfer the smaller of the two amounts; break ties by name (alphabetical). Calling it does not change the ledger.

## Notes

Never use floats for money. State your assumptions.
