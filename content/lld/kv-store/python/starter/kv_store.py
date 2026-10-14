class KVStore:
    """An in-memory key-value store with nested transactions. See the spec for the contract."""

    def set(self, key: str, value) -> None:
        raise NotImplementedError

    def get(self, key: str):
        raise NotImplementedError

    def delete(self, key: str) -> bool:
        raise NotImplementedError

    def begin(self) -> None:
        raise NotImplementedError

    def commit(self) -> None:
        raise NotImplementedError

    def rollback(self) -> None:
        raise NotImplementedError

    def depth(self) -> int:
        raise NotImplementedError
