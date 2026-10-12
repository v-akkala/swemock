from collections import OrderedDict


class RecencyCache:

    def __init__(self, capacity: int):
        self.capacity = capacity
        self.items = OrderedDict()

    def get(self, key: int) -> int:
        if key not in self.items:
            return -1
        self.items.move_to_end(key)
        return self.items[key]

    def put(self, key: int, value: int) -> None:
        if key in self.items:
            self.items.move_to_end(key)
        elif len(self.items) == self.capacity:
            self.items.popitem(last=False)
        self.items[key] = value
