import time
from typing import Any, Callable, Optional


class _Node:
    __slots__ = ("key", "value", "expires", "prev", "next")

    def __init__(self, key=None, value=None, expires: Optional[float] = None) -> None:
        self.key = key
        self.value = value
        self.expires = expires
        self.prev: "Optional[_Node]" = None
        self.next: "Optional[_Node]" = None


class LRUCache:
    """A fixed-capacity cache that evicts the least recently used entry, with optional per-entry expiry."""

    def __init__(self, capacity: int, clock: Callable[[], float] = time.monotonic) -> None:
        if capacity < 1:
            raise ValueError("capacity must be at least 1")
        self._capacity = capacity
        self._clock = clock
        self._index: dict[Any, _Node] = {}
        # Sentinels: head.next is the most recently used node, tail.prev the least.
        self._head = _Node()
        self._tail = _Node()
        self._head.next = self._tail
        self._tail.prev = self._head

    def get(self, key):
        node = self._index.get(key)
        if node is None or self._expired(node):
            if node is not None:
                self._remove(node)
            return None
        self._unlink(node)
        self._push_front(node)
        return node.value

    def put(self, key, value, ttl: Optional[float] = None) -> None:
        expires = None if ttl is None else self._clock() + ttl
        node = self._index.get(key)
        if node is not None:
            node.value = value
            node.expires = expires
            self._unlink(node)
            self._push_front(node)
            return
        self._purge_expired()
        if len(self._index) >= self._capacity:
            self._remove(self._tail.prev)
        node = _Node(key, value, expires)
        self._index[key] = node
        self._push_front(node)

    def size(self) -> int:
        self._purge_expired()
        return len(self._index)

    def keys(self) -> list:
        self._purge_expired()
        out, node = [], self._head.next
        while node is not self._tail:
            out.append(node.key)
            node = node.next
        return out

    # -- internals ---------------------------------------------------------------------------------

    def _expired(self, node: _Node) -> bool:
        return node.expires is not None and self._clock() >= node.expires

    def _purge_expired(self) -> None:
        for node in [n for n in self._index.values() if self._expired(n)]:
            self._remove(node)

    def _remove(self, node: _Node) -> None:
        self._unlink(node)
        del self._index[node.key]

    def _unlink(self, node: _Node) -> None:
        node.prev.next = node.next
        node.next.prev = node.prev

    def _push_front(self, node: _Node) -> None:
        node.prev = self._head
        node.next = self._head.next
        self._head.next.prev = node
        self._head.next = node
