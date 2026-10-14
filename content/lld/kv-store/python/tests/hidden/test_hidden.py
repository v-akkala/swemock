import pytest

from kv_store import KVStore


def test_core_inner_commit_merges_into_the_outer_transaction():
    s = KVStore()
    s.begin()
    s.set("a", 1)
    s.begin()
    s.set("a", 2)
    s.set("b", 3)
    s.commit()
    assert s.depth() == 1
    assert (s.get("a"), s.get("b")) == (2, 3)
    s.commit()
    assert (s.get("a"), s.get("b")) == (2, 3)


def test_core_outer_rollback_discards_a_committed_inner_transaction():
    s = KVStore()
    s.set("a", 1)
    s.begin()
    s.begin()
    s.set("a", 2)
    s.commit()
    s.rollback()
    assert s.get("a") == 1


def test_core_inner_rollback_keeps_outer_changes():
    s = KVStore()
    s.begin()
    s.set("a", 1)
    s.begin()
    s.set("a", 2)
    s.rollback()
    assert s.get("a") == 1
    s.commit()
    assert s.get("a") == 1


def test_core_delete_inside_a_transaction_can_be_rolled_back():
    s = KVStore()
    s.set("a", 1)
    s.begin()
    assert s.delete("a") is True
    assert s.get("a") is None
    s.rollback()
    assert s.get("a") == 1


def test_core_delete_then_set_inside_a_transaction():
    s = KVStore()
    s.set("a", 1)
    s.begin()
    s.delete("a")
    s.set("a", 5)
    s.commit()
    assert s.get("a") == 5


def test_core_committed_delete_removes_the_key():
    s = KVStore()
    s.set("a", 1)
    s.begin()
    s.delete("a")
    s.commit()
    assert s.get("a") is None
    assert s.delete("a") is False


def test_edge_none_is_a_value_not_a_deletion():
    s = KVStore()
    s.set("a", None)
    assert s.delete("a") is True  # it existed, holding None
    s.set("b", 1)
    s.begin()
    s.set("b", None)
    assert s.get("b") is None
    s.commit()
    assert s.delete("b") is True


def test_edge_rollback_and_commit_without_a_transaction_raise():
    s = KVStore()
    with pytest.raises(RuntimeError):
        s.rollback()
    s.begin()
    s.commit()
    with pytest.raises(RuntimeError):
        s.commit()


def test_edge_deleting_a_missing_key_inside_a_transaction():
    s = KVStore()
    s.begin()
    assert s.delete("nope") is False
    s.commit()
    assert s.get("nope") is None


def test_core_many_nested_levels():
    s = KVStore()
    for i in range(200):
        s.begin()
        s.set(f"k{i}", i)
    assert s.depth() == 200
    assert s.get("k0") == 0 and s.get("k199") == 199
    for _ in range(100):
        s.rollback()
    assert s.get("k99") == 99 and s.get("k100") is None
    for _ in range(100):
        s.commit()
    assert s.depth() == 0 and s.get("k50") == 50
