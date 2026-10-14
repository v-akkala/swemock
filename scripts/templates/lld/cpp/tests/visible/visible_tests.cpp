#include "doctest.h"
#include <stdexcept>
#include <string>
#include "tally.hpp"

TEST_CASE("core: add and get") {
    Tally t;
    t.add("a");
    t.add("a", 2);
    CHECK(t.get("a") == 3);
    CHECK(t.get("missing") == 0);
}

TEST_CASE("core: top orders by count") {
    Tally t;
    t.add("x", 1);
    t.add("y", 5);
    t.add("z", 3);
    auto top = t.top(2);
    REQUIRE(top.size() == 2);
    CHECK(top[0].first == "y");
    CHECK(top[1].first == "z");
}

TEST_CASE("edge: rejects non-positive") {
    Tally t;
    CHECK_THROWS_AS(t.add("a", 0), std::invalid_argument);
}
