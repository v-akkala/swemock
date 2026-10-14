class Tally:
    """Counts how many times each key was added."""

    def __init__(self) -> None:
        self._counts: dict[str, int] = {}

    def add(self, key: str, n: int = 1) -> None:
        if n <= 0:
            raise ValueError("n must be positive")
        self._counts[key] = self._counts.get(key, 0) + n

    def get(self, key: str) -> int:
        return self._counts.get(key, 0)

    def top(self, k: int) -> list[tuple[str, int]]:
        if k <= 0:
            return []
        ranked = sorted(self._counts.items(), key=lambda kv: (-kv[1], kv[0]))
        return ranked[:k]

    def remove(self, key: str, n: int = 1) -> None:
        have = self._counts.get(key, 0)
        if n <= 0 or have < n:
            raise KeyError(key)
        if have == n:
            del self._counts[key]
        else:
            self._counts[key] = have - n
