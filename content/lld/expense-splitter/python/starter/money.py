"""Provided code (file 1): money is whole cents, and this is the one tricky bit of arithmetic."""


class LedgerError(Exception):
    """An invalid ledger operation (bad amount, bad participants, …)."""


def split_evenly(total_cents: int, n: int) -> list[int]:
    """Share `total_cents` among `n` people so the shares add up exactly.

    When it doesn't divide evenly, the first `total_cents % n` shares get one extra cent.
    """
    if n <= 0:
        raise LedgerError("need at least one person")
    base, extra = divmod(total_cents, n)
    return [base + 1 if i < extra else base for i in range(n)]


def format_cents(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    whole, frac = divmod(abs(cents), 100)
    return f"{sign}{whole}.{frac:02d}"
