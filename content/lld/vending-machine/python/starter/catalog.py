"""Provided code (file 1): coins, products, the stock, and the errors of the vending system."""

from dataclasses import dataclass
from typing import Iterable

COINS = (100, 25, 10, 5)  # accepted coins in cents, largest first


class VendingError(Exception):
    """Base class for every error the vending system raises."""


class InvalidCoinError(VendingError):
    """The coin is not one of COINS."""


class UnknownProductError(VendingError):
    """No product has this code."""


class SoldOutError(VendingError):
    """The product exists but none is left."""


class InsufficientFundsError(VendingError):
    """The inserted money does not cover the price; `needed` is the missing amount in cents."""

    def __init__(self, needed: int) -> None:
        super().__init__(f"insert {needed} more cents")
        self.needed = needed


class CannotMakeChangeError(VendingError):
    """The machine cannot pay out the exact change for this sale."""


@dataclass(frozen=True)
class Product:
    code: str
    name: str
    price: int  # cents


class Inventory:
    """The machine's stock: products and how many of each are left."""

    def __init__(self, products: Iterable[Product]) -> None:
        self._products = {p.code: p for p in products}
        self._quantity = {p.code: 0 for p in products}

    def product(self, code: str) -> Product:
        if code not in self._products:
            raise UnknownProductError(code)
        return self._products[code]

    def quantity(self, code: str) -> int:
        self.product(code)
        return self._quantity[code]

    def add_stock(self, code: str, qty: int) -> None:
        self.product(code)
        if qty <= 0:
            raise ValueError("qty must be positive")
        self._quantity[code] += qty

    def remove_one(self, code: str) -> None:
        if self.quantity(code) == 0:
            raise SoldOutError(code)
        self._quantity[code] -= 1
