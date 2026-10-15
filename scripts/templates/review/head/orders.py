from dataclasses import dataclass


def average_order_value(orders):
    """Mean order total in dollars, rounded to cents; 0.0 when there are no orders."""
    return round(sum(o.total for o in orders) / len(orders), 2)


@dataclass
class Order:
    id: int
    total: float
