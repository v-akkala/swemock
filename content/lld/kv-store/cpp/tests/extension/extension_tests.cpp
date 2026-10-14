#include <string>

#include "doctest.h"
#include "kv_store.hpp"

TEST_CASE("extension: count counts keys with the value") {
    KVStore s;
    s.set("a", "x");
    s.set("b", "x");
    s.set("c", "y");
    CHECK(s.count("x") == 2);
    CHECK(s.count("y") == 1);
    CHECK(s.count("z") == 0);
}

TEST_CASE("extension: count follows overwrites and deletes") {
    KVStore s;
    s.set("a", "x");
    s.set("b", "x");
    s.set("a", "y");
    s.remove("b");
    CHECK(s.count("x") == 0);
    CHECK(s.count("y") == 1);
}

TEST_CASE("extension: count sees pending changes and rollback restores it") {
    KVStore s;
    s.set("a", "x");
    s.begin();
    s.set("b", "x");
    s.set("a", "y");
    CHECK(s.count("x") == 1);
    CHECK(s.count("y") == 1);
    s.rollback();
    CHECK(s.count("x") == 1);
    CHECK(s.count("y") == 0);
}

TEST_CASE("extension: count in nested transactions") {
    KVStore s;
    s.set("a", "x");
    s.begin();
    s.set("b", "x");
    s.begin();
    s.remove("a");
    CHECK(s.count("x") == 1);
    s.commit();
    CHECK(s.count("x") == 1);
    s.commit();
    CHECK(s.count("x") == 1);
}
