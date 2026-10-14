class LRUCache:
    """A fixed-capacity cache that evicts the least recently used entry. See the spec for the contract."""

    def __init__(self, capacity: int) -> None:
        raise NotImplementedError

    def get(self, key):
        raise NotImplementedError

    def put(self, key, value) -> None:
        raise NotImplementedError

    def size(self) -> int:
        raise NotImplementedError

    def keys(self) -> list:
        raise NotImplementedError
