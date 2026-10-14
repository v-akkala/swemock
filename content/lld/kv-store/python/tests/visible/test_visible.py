import pytest

from kv_store import KVStore


def test_core_set_get_delete():
    s = KVStore()
    s.set("a", 1)
    assert s.get("a") == 1
    assert s.delete("a") is True
    assert s.get("a") is None
    assert s.delete("a") is False


def test_core_rollback_discards_changes():
    s = KVStore()
    s.set("a", 1)
    s.begin()
    s.set("a", 2)
    s.set("b", 3)
    assert s.get("a") == 2
    s.rollback()
    assert s.get("a") == 1
    assert s.get("b") is None


def test_core_commit_keeps_changes():
    s = KVStore()
    s.begin()
    s.set("a", 1)
    s.commit()
    assert s.get("a") == 1
    assert s.depth() == 0


def test_edge_commit_without_transaction_raises():
    with pytest.raises(RuntimeError):
        KVStore().commit()
