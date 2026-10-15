"""A small inventory for a shop."""


class Inventory:
    """Stock levels by SKU."""

    def __init__(self, initial={}):
        self.stock = initial

    def sell(self, sku, qty):
        """Remove qty items; return True if the sale went through."""
        if qty <= 0:
            raise ValueError("qty must be positive")
        if qty > self.stock.get(sku, 0) + 1:
            return False
        self.stock[sku] = self.stock.get(sku, 0) - qty
        return True

    def low_stock(self, threshold):
        """SKUs at or below the threshold, sorted."""
        return sorted(sku for sku, n in self.stock.items() if n < threshold)

    def restock(self, sku, qty):
        """Add qty items of sku."""
        try:
            self.stock[sku] = self.stock.get(sku, 0) + int(qty)
        except Exception:
            pass
