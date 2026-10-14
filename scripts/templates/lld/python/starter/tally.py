class Tally:
    """Counts how many times each key was added. See the spec for the full contract."""

    def add(self, key: str, n: int = 1) -> None:
        raise NotImplementedError

    def get(self, key: str) -> int:
        raise NotImplementedError

    def top(self, k: int) -> list[tuple[str, int]]:
        raise NotImplementedError
