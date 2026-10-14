#include <stdexcept>
#include <vector>

#include "doctest.h"
#include "lru_cache.hpp"

TEST_CASE("core: put existing key replaces without evicting") {
    LRUCache c(2);
    c.put(1, 1);
    c.put(2, 2);
    c.put(1, 10);
    CHECK(c.size() == 2);
    CHECK(c.get(1) == 10);
    CHECK(c.get(2) == 2);
}

TEST_CASE("core: put existing key marks it recent") {
    LRUCache c(2);
    c.put(1, 1);
    c.put(2, 2);
    c.put(1, 3);
    c.put(3, 4);  // evicts 2, not 1
    CHECK(!c.get(2).has_value());
    CHECK(c.get(1) == 3);
}

TEST_CASE("core: capacity one") {
    LRUCache c(1);
    c.put(1, 1);
    c.put(2, 2);
    CHECK(!c.get(1).has_value());
    CHECK(c.get(2) == 2);
    CHECK(c.size() == 1);
}

TEST_CASE("edge: missing get changes nothing") {
    LRUCache c(2);
    c.put(1, 1);
    c.put(2, 2);
    CHECK(!c.get(99).has_value());
    CHECK(c.keys() == std::vector<int>{2, 1});
    c.put(3, 3);
    CHECK(!c.get(1).has_value());
}

TEST_CASE("edge: keys does not change order") {
    LRUCache c(2);
    c.put(1, 1);
    c.put(2, 2);
    CHECK(c.keys() == std::vector<int>{2, 1});
    CHECK(c.keys() == std::vector<int>{2, 1});
    c.put(3, 3);
    CHECK(!c.get(1).has_value());
}

TEST_CASE("edge: zero is a value") {
    LRUCache c(2);
    c.put(1, 0);
    REQUIRE(c.get(1).has_value());
    CHECK(*c.get(1) == 0);
}

TEST_CASE("core: many operations stay consistent") {
    LRUCache c(50);
    for (int i = 0; i < 5000; i++) {
        c.put(i % 80, i);
        c.get((i * 7) % 80);
    }
    CHECK(c.size() == 50);
    CHECK(c.keys().size() == 50);
}

TEST_CASE("edge: negative capacity") {
    CHECK_THROWS_AS(LRUCache(-3), std::invalid_argument);
}
