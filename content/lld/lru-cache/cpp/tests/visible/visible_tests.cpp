#include <stdexcept>
#include <vector>

#include "doctest.h"
#include "lru_cache.hpp"

TEST_CASE("core: get returns what was put") {
    LRUCache c(2);
    c.put(1, 10);
    c.put(2, 20);
    CHECK(c.get(1) == 10);
    CHECK(c.get(2) == 20);
    CHECK(!c.get(99).has_value());
}

TEST_CASE("core: evicts least recently used") {
    LRUCache c(2);
    c.put(1, 10);
    c.put(2, 20);
    c.get(1);  // 2 is now the least recently used
    c.put(3, 30);
    CHECK(!c.get(2).has_value());
    CHECK(c.get(1) == 10);
    CHECK(c.get(3) == 30);
}

TEST_CASE("core: keys are ordered most recent first") {
    LRUCache c(3);
    c.put(1, 1);
    c.put(2, 2);
    c.put(3, 3);
    c.get(1);
    CHECK(c.keys() == std::vector<int>{1, 3, 2});
}

TEST_CASE("edge: rejects bad capacity") {
    CHECK_THROWS_AS(LRUCache(0), std::invalid_argument);
}
