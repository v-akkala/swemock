from lru_cache import LRUCache


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_extension_entry_expires_after_ttl():
    clock = Clock()
    c = LRUCache(2, clock)
    c.put("a", 1, ttl=10)
    clock.now = 9.9
    assert c.get("a") == 1
    clock.now = 10.0
    assert c.get("a") is None


def test_extension_expired_entries_are_not_counted_or_listed():
    clock = Clock()
    c = LRUCache(3, clock)
    c.put("a", 1, ttl=5)
    c.put("b", 2)
    clock.now = 6
    assert c.size() == 1
    assert c.keys() == ["b"]


def test_extension_expired_entry_is_dropped_before_a_live_one_is_evicted():
    clock = Clock()
    c = LRUCache(2, clock)
    c.put("old", 1, ttl=1)
    c.put("live", 2)
    clock.now = 2
    c.put("new", 3)  # "old" is expired, so "live" must survive
    assert c.get("live") == 2
    assert c.get("new") == 3


def test_extension_replacing_resets_the_ttl():
    clock = Clock()
    c = LRUCache(2, clock)
    c.put("a", 1, ttl=5)
    clock.now = 4
    c.put("a", 2, ttl=5)
    clock.now = 8
    assert c.get("a") == 2
    c.put("a", 3)  # no ttl: permanent
    clock.now = 1000
    assert c.get("a") == 3
