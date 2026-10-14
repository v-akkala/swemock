from collections import Counter
from typing import Optional

from catalog import COINS, CannotMakeChangeError, InsufficientFundsError, InvalidCoinError, Inventory, Product, SoldOutError


def make_change(amount: int, supply: Optional[dict[int, int]]) -> Optional[list[int]]:
    """The fewest coins (largest first) that total `amount`, using at most `supply` of each coin.

    `supply=None` means unlimited. Returns None if exact change is impossible.
    """
    if supply is None:
        change = []
        for coin in COINS:
            n, amount = divmod(amount, coin)
            change += [coin] * n
        return change if amount == 0 else None
    # best[a] = the fewest coins for amount a using the supply, found by dynamic programming over coin types.
    best: dict[int, list[int]] = {0: []}
    for coin in COINS:
        available = supply.get(coin, 0)
        updated = dict(best)
        for have, coins in best.items():
            for k in range(1, available + 1):
                total = have + coin * k
                if total > amount:
                    break
                candidate = coins + [coin] * k
                if total not in updated or len(candidate) < len(updated[total]):
                    updated[total] = candidate
        best = updated
    return best.get(amount)


class VendingMachine:
    """Takes coins, sells products, and returns change, optionally from a limited float."""

    def __init__(self, inventory: Inventory, float_coins: Optional[dict[int, int]] = None) -> None:
        self._inventory = inventory
        self._float = None if float_coins is None else {c: float_coins.get(c, 0) for c in COINS}
        self._inserted: Counter[int] = Counter()

    def insert(self, coin: int) -> None:
        if coin not in COINS:
            raise InvalidCoinError(coin)
        self._inserted[coin] += 1

    def balance(self) -> int:
        return sum(coin * n for coin, n in self._inserted.items())

    def state(self) -> str:
        return "has_money" if self._inserted else "idle"

    def select(self, code: str) -> tuple[Product, list[int]]:
        product = self._inventory.product(code)  # UnknownProductError
        if self._inventory.quantity(code) == 0:
            raise SoldOutError(code)
        balance = self.balance()
        if balance < product.price:
            raise InsufficientFundsError(product.price - balance)
        change = make_change(balance - product.price, self._float)
        if change is None:
            raise CannotMakeChangeError(balance - product.price)
        # Everything is validated: commit.
        self._inventory.remove_one(code)
        if self._float is not None:
            for coin in change:
                self._float[coin] -= 1
            for coin, n in self._inserted.items():
                self._float[coin] += n
        self._inserted.clear()
        return product, change

    def cancel(self) -> list[int]:
        coins = [coin for coin in COINS for _ in range(self._inserted[coin])]
        self._inserted.clear()
        return coins

    def float(self) -> dict[int, int]:
        return dict(self._float or {})
