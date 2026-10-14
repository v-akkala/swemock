import pytest

from lru_cache import LRUCache


def test_core_put_existing_key_replaces_without_evicting():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    c.put("a", 10)
    assert c.size() == 2
    assert c.get("a") == 10
    assert c.get("b") == 2


def test_core_put_existing_key_marks_it_recent():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    c.put("a", 3)
    c.put("c", 4)  # evicts b, not a
    assert c.get("b") is None
    assert c.get("a") == 3


def test_core_capacity_one():
    c = LRUCache(1)
    c.put("a", 1)
    c.put("b", 2)
    assert c.get("a") is None
    assert c.get("b") == 2
    assert c.size() == 1


def test_edge_missing_get_changes_nothing():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    assert c.get("zzz") is None
    assert c.keys() == ["b", "a"]
    c.put("c", 3)
    assert c.get("a") is None


def test_edge_keys_does_not_change_order():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    assert c.keys() == ["b", "a"]
    assert c.keys() == ["b", "a"]
    c.put("c", 3)
    assert c.get("a") is None


def test_edge_none_and_falsy_values_are_values():
    c = LRUCache(2)
    c.put("zero", 0)
    c.put("empty", "")
    assert c.get("zero") == 0
    assert c.get("empty") == ""
    assert c.size() == 2


def test_core_many_operations_stay_consistent():
    c = LRUCache(50)
    for i in range(5000):
        c.put(i % 80, i)
        c.get((i * 7) % 80)
    assert c.size() == 50
    assert len(set(c.keys())) == 50


def test_edge_negative_capacity():
    with pytest.raises(ValueError):
        LRUCache(-3)
