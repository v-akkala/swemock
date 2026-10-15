class Catalog:
    """A read-only collection of items."""

    def __init__(self, items):
        self.items = list(items)

    def all(self):
        return list(self.items)

    def page(self, number, size=10):
        """Items on a 1-based page. Sizes must be 1..100; pages past the end are empty."""
        start = (number - 1) * size
        end = start + size - 1
        return self.items[start:end]
