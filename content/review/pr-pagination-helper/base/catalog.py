class Catalog:
    """A read-only collection of items."""

    def __init__(self, items):
        self.items = list(items)

    def all(self):
        return list(self.items)
