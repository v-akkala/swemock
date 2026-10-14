#include <optional>
#include <vector>

#include "doctest.h"
#include "lru_cache.hpp"

namespace {
struct FakeClock {
    double now = 0;
    double operator()() const { return now; }
};
}  // namespace

TEST_CASE("extension: entry expires after ttl") {
    FakeClock t;
    LRUCache c(2, [&t] { return t(); });
    c.put(1, 1, 10.0);
    t.now = 9.9;
    CHECK(c.get(1) == 1);
    t.now = 10.0;
    CHECK(!c.get(1).has_value());
}

TEST_CASE("extension: expired entries are not counted or listed") {
    FakeClock t;
    LRUCache c(3, [&t] { return t(); });
    c.put(1, 1, 5.0);
    c.put(2, 2);
    t.now = 6;
    CHECK(c.size() == 1);
    CHECK(c.keys() == std::vector<int>{2});
}

TEST_CASE("extension: expired entry is dropped before a live one is evicted") {
    FakeClock t;
    LRUCache c(2, [&t] { return t(); });
    c.put(1, 1, 1.0);
    c.put(2, 2);
    t.now = 2;
    c.put(3, 3);
    CHECK(c.get(2) == 2);
    CHECK(c.get(3) == 3);
}

TEST_CASE("extension: replacing resets the ttl") {
    FakeClock t;
    LRUCache c(2, [&t] { return t(); });
    c.put(1, 1, 5.0);
    t.now = 4;
    c.put(1, 2, 5.0);
    t.now = 8;
    CHECK(c.get(1) == 2);
    c.put(1, 3);
    t.now = 1000;
    CHECK(c.get(1) == 3);
}
