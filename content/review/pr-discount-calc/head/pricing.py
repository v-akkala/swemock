import math


def line_total(price_cents, quantity):
    """Price of a line in integer cents."""
    return price_cents * quantity


def apply_discount(total_cents, percent, cap_cents=None):
    """Total after a percentage discount, in integer cents.

    The discount is rounded half up to a whole cent and may be capped at `cap_cents`.
    """
    if not 0 <= percent <= 100:
        raise ValueError("percent must be between 0 and 100")
    discount = (total_cents * percent * 2 + 100) // 200
    if cap_cents is not None:
        discount = min(discount, cap_cents)
    return total_cents - discount
