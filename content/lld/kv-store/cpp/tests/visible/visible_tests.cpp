#include <stdexcept>
#include <string>

#include "doctest.h"
#include "kv_store.hpp"

TEST_CASE("core: set get and remove") {
    KVStore s;
    s.set("a", "1");
    CHECK(s.get("a") == "1");
    CHECK(s.remove("a"));
    CHECK(!s.get("a").has_value());
    CHECK_FALSE(s.remove("a"));
}

TEST_CASE("core: rollback discards changes") {
    KVStore s;
    s.set("a", "1");
    s.begin();
    s.set("a", "2");
    s.set("b", "3");
    CHECK(s.get("a") == "2");
    s.rollback();
    CHECK(s.get("a") == "1");
    CHECK(!s.get("b").has_value());
}

TEST_CASE("core: commit keeps changes") {
    KVStore s;
    s.begin();
    s.set("a", "1");
    s.commit();
    CHECK(s.get("a") == "1");
    CHECK(s.depth() == 0);
}

TEST_CASE("edge: commit without a transaction throws") {
    KVStore s;
    CHECK_THROWS_AS(s.commit(), std::logic_error);
}
