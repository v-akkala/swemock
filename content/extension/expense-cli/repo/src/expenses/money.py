import re

from .errors import InvalidAmount

_AMOUNT = re.compile(r"^\$?(\d+)(?:\.(\d{1,2}))?$")


def parse_amount(text):
    """'12.5' or '$12' -> integer cents. Amounts must be positive with at most two decimals."""
    match = _AMOUNT.match(text.strip())
    if not match:
        raise InvalidAmount(f"not a valid amount: {text!r}")
    whole, fraction = match.groups()
    cents = int(whole) * 100 + int((fraction or "0").ljust(2, "0"))
    if cents <= 0:
        raise InvalidAmount("amount must be greater than zero")
    return cents


def format_amount(cents):
    """Integer cents -> '$12.50' (negative amounts as '-$1.00')."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}${cents // 100}.{cents % 100:02d}"
