_DELETED = object()  # tombstone: a pending deletion (None stays an ordinary value)


class KVStore:
    """An in-memory key-value store with nested transactions, built from layered overlays."""

    def __init__(self) -> None:
        self._data: dict[str, object] = {}
        self._overlays: list[dict[str, object]] = []

    def set(self, key: str, value) -> None:
        self._top()[key] = value

    def get(self, key: str):
        for overlay in reversed(self._overlays):
            if key in overlay:
                value = overlay[key]
                return None if value is _DELETED else value
        return self._data.get(key)

    def delete(self, key: str) -> bool:
        existed = self._exists(key)
        if existed:
            if self._overlays:
                self._overlays[-1][key] = _DELETED
            else:
                del self._data[key]
        return existed

    def begin(self) -> None:
        self._overlays.append({})

    def commit(self) -> None:
        top = self._pop()
        target = self._overlays[-1] if self._overlays else None
        for key, value in top.items():
            if target is not None:
                target[key] = value
            elif value is _DELETED:
                self._data.pop(key, None)
            else:
                self._data[key] = value

    def rollback(self) -> None:
        self._pop()

    def depth(self) -> int:
        return len(self._overlays)

    def count(self, value) -> int:
        return sum(1 for key in self._keys() if self.get(key) == value)

    # -- internals ---------------------------------------------------------------------------------

    def _top(self) -> dict[str, object]:
        return self._overlays[-1] if self._overlays else self._data

    def _pop(self) -> dict[str, object]:
        if not self._overlays:
            raise RuntimeError("no open transaction")
        return self._overlays.pop()

    def _exists(self, key: str) -> bool:
        for overlay in reversed(self._overlays):
            if key in overlay:
                return overlay[key] is not _DELETED
        return key in self._data

    def _keys(self) -> "set[str]":  # quoted: the method named set shadows the builtin in the class body
        keys = set(self._data)
        for overlay in self._overlays:
            keys |= overlay.keys()
        return {k for k in keys if self._exists(k)}
