import pytest

from lru_cache import LRUCache


def test_core_get_returns_what_was_put():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    assert c.get("a") == 1
    assert c.get("b") == 2
    assert c.get("missing") is None


def test_core_evicts_least_recently_used():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    c.get("a")  # b is now the least recently used
    c.put("c", 3)
    assert c.get("b") is None
    assert c.get("a") == 1
    assert c.get("c") == 3


def test_core_keys_are_ordered_most_recent_first():
    c = LRUCache(3)
    for k in "abc":
        c.put(k, ord(k))
    c.get("a")
    assert c.keys() == ["a", "c", "b"]


def test_edge_rejects_bad_capacity():
    with pytest.raises(ValueError):
        LRUCache(0)
