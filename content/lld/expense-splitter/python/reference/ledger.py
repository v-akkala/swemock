from typing import Optional

from money import LedgerError, split_evenly


def _largest_remainder(total: int, weights: dict[str, int]) -> dict[str, int]:
    """Split `total` cents by integer weights; leftover cents go to the largest fractions, ties by name."""
    weight_sum = sum(weights.values())
    shares = {name: total * w // weight_sum for name, w in weights.items()}
    remainders = {name: total * w % weight_sum for name, w in weights.items()}
    leftover = total - sum(shares.values())
    for name in sorted(weights, key=lambda n: (-remainders[n], n))[:leftover]:
        shares[name] += 1
    return shares


class Ledger:
    """Tracks one signed balance per user; everything else is derived from it."""

    def __init__(self) -> None:
        self._balances: dict[str, int] = {}

    def add_expense(self, payer: str, amount: int, participants: Optional[list] = None, percentages: Optional[dict] = None) -> None:
        if amount <= 0:
            raise LedgerError("amount must be positive")
        if percentages is not None:
            if sum(percentages.values()) != 100 or any(p <= 0 for p in percentages.values()) or not percentages:
                raise LedgerError("percentages must be positive and add up to 100")
            shares = _largest_remainder(amount, percentages)
        else:
            if not participants or len(set(participants)) != len(participants):
                raise LedgerError("participants must be a non-empty list without duplicates")
            shares = dict(zip(participants, split_evenly(amount, len(participants))))
        self._add(payer, amount)
        for user, share in shares.items():
            self._add(user, -share)

    def balance(self, user: str) -> int:
        return self._balances.get(user, 0)

    def balances(self) -> dict:
        return {user: b for user, b in self._balances.items() if b != 0}

    def settle(self, payer: str, receiver: str, amount: int) -> None:
        if amount <= 0:
            raise LedgerError("amount must be positive")
        if payer == receiver:
            raise LedgerError("cannot settle with yourself")
        self._add(payer, amount)
        self._add(receiver, -amount)

    def simplify(self) -> list:
        owed = {u: b for u, b in self._balances.items() if b > 0}
        owes = {u: -b for u, b in self._balances.items() if b < 0}
        transfers = []
        while owed and owes:
            creditor = min(owed, key=lambda u: (-owed[u], u))
            debtor = min(owes, key=lambda u: (-owes[u], u))
            amount = min(owed[creditor], owes[debtor])
            transfers.append((debtor, creditor, amount))
            owed[creditor] -= amount
            owes[debtor] -= amount
            if owed[creditor] == 0:
                del owed[creditor]
            if owes[debtor] == 0:
                del owes[debtor]
        return transfers

    def _add(self, user: str, delta: int) -> None:
        self._balances[user] = self._balances.get(user, 0) + delta
