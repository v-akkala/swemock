from catalog import Inventory, Product


class VendingMachine:
    """Takes coins, sells products, and returns change. See the spec for the contract."""

    def __init__(self, inventory: Inventory) -> None:
        raise NotImplementedError

    def insert(self, coin: int) -> None:
        """Accept one coin, or raise InvalidCoinError."""
        raise NotImplementedError

    def balance(self) -> int:
        """The cents inserted so far."""
        raise NotImplementedError

    def state(self) -> str:
        """"idle" when nothing is inserted, "has_money" otherwise."""
        raise NotImplementedError

    def select(self, code: str) -> tuple[Product, list[int]]:
        """Sell the product and return (product, change coins)."""
        raise NotImplementedError

    def cancel(self) -> list[int]:
        """Return the inserted coins, largest first, and reset the balance."""
        raise NotImplementedError
