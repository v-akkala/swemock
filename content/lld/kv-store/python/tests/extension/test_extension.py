from kv_store import KVStore


def test_extension_count_counts_keys_with_the_value():
    s = KVStore()
    s.set("a", "x")
    s.set("b", "x")
    s.set("c", "y")
    assert s.count("x") == 2
    assert s.count("y") == 1
    assert s.count("z") == 0


def test_extension_count_follows_overwrites_and_deletes():
    s = KVStore()
    s.set("a", "x")
    s.set("b", "x")
    s.set("a", "y")
    s.delete("b")
    assert s.count("x") == 0
    assert s.count("y") == 1


def test_extension_count_sees_pending_changes_and_rollback_restores_it():
    s = KVStore()
    s.set("a", "x")
    s.begin()
    s.set("b", "x")
    s.set("a", "y")
    assert s.count("x") == 1
    assert s.count("y") == 1
    s.rollback()
    assert s.count("x") == 1
    assert s.count("y") == 0


def test_extension_count_in_nested_transactions():
    s = KVStore()
    s.set("a", "x")
    s.begin()
    s.set("b", "x")
    s.begin()
    s.delete("a")
    assert s.count("x") == 1
    s.commit()
    assert s.count("x") == 1
    s.commit()
    assert s.count("x") == 1
