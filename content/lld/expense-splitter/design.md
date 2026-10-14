# Design notes

Every question the ledger answers is a question about **one number per person**: their net balance. An expense, a settlement, and a simplification are all transformations of those numbers, so the ledger stores only a dictionary of balances, not a list of "who owes whom" pairs. Pairwise debts can be derived (that is what `simplify` does), but they cannot be maintained cheaply.

- **Expense.** Compute shares with the provided `split_evenly` (the tricky rounding already lives there), add the full amount to the payer, subtract each share from its participant. The payer's own share nets out automatically. The sum of all balances stays zero because every change is balanced.
- **Settle.** `payer` gets credit and `receiver` gets debited: `balance[payer] += amount; balance[receiver] -= amount`. No special handling for "overpaying".
- **Validation first.** Check the amount and participants before touching any balance, so a failed call changes nothing. Use the provided `LedgerError` rather than inventing exceptions.
- **Simplify.** Split the balances into debtors and creditors, sort each (largest amount first, then name), and match greedily. Each transfer zeroes at least one person, so there are at most n − 1 transfers. It works on a *copy*; the ledger is untouched.
- **Complexity.** `add_expense` O(p), `balance` O(1), `simplify` O(n log n) with heaps or repeated sorting.

**What to avoid.** A class per split type up front, a `Money` class when the provided integer cents will do, a history list that nothing reads.

**The requirement change** (percentage splits) is a different way of computing shares: weights instead of equal parts. The fair way to round is the *largest remainder* method (floor each share, then give the leftover cents to the largest fractional parts, ties by name), which generalizes `split_evenly`. Keeping share computation separate from balance updates means the change is one new function.
