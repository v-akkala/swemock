#include "doctest.h"
#include <stdexcept>
#include <string>
#include "tally.hpp"

TEST_CASE("extension: remove decrements") {
    Tally t;
    t.add("a", 3);
    t.remove("a");
    CHECK(t.get("a") == 2);
}

TEST_CASE("extension: remove drops zero keys") {
    Tally t;
    t.add("a", 2);
    t.remove("a", 2);
    CHECK(t.get("a") == 0);
    CHECK(t.top(5).empty());
}

TEST_CASE("extension: remove too much throws") {
    Tally t;
    t.add("a");
    CHECK_THROWS_AS(t.remove("a", 2), std::out_of_range);
    CHECK_THROWS_AS(t.remove("never"), std::out_of_range);
    CHECK(t.get("a") == 1);
}
