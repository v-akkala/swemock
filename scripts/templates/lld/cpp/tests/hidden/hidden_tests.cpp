#include "doctest.h"
#include <stdexcept>
#include <string>
#include "tally.hpp"

TEST_CASE("core: ties break by key") {
    Tally t;
    for (auto k : {"b", "a", "c"}) t.add(k, 2);
    auto top = t.top(3);
    REQUIRE(top.size() == 3);
    CHECK(top[0].first == "a");
    CHECK(top[1].first == "b");
    CHECK(top[2].first == "c");
}

TEST_CASE("edge: top k larger than keys") {
    Tally t;
    t.add("a");
    CHECK(t.top(10).size() == 1);
    CHECK(t.top(0).empty());
    CHECK(t.top(-1).empty());
}

TEST_CASE("edge: failed add changes nothing") {
    Tally t;
    t.add("a", 2);
    CHECK_THROWS_AS(t.add("a", -1), std::invalid_argument);
    CHECK(t.get("a") == 2);
}

TEST_CASE("core: many keys") {
    Tally t;
    for (int i = 0; i < 1000; i++) t.add("k" + std::to_string(i % 50), i % 7 + 1);
    CHECK(t.top(100).size() == 50);
}
