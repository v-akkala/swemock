#include <stdexcept>
#include <string>

#include "doctest.h"
#include "kv_store.hpp"

TEST_CASE("core: inner commit merges into the outer transaction") {
    KVStore s;
    s.begin();
    s.set("a", "1");
    s.begin();
    s.set("a", "2");
    s.set("b", "3");
    s.commit();
    CHECK(s.depth() == 1);
    CHECK(s.get("a") == "2");
    CHECK(s.get("b") == "3");
    s.commit();
    CHECK(s.get("a") == "2");
    CHECK(s.get("b") == "3");
}

TEST_CASE("core: outer rollback discards a committed inner transaction") {
    KVStore s;
    s.set("a", "1");
    s.begin();
    s.begin();
    s.set("a", "2");
    s.commit();
    s.rollback();
    CHECK(s.get("a") == "1");
}

TEST_CASE("core: inner rollback keeps outer changes") {
    KVStore s;
    s.begin();
    s.set("a", "1");
    s.begin();
    s.set("a", "2");
    s.rollback();
    CHECK(s.get("a") == "1");
    s.commit();
    CHECK(s.get("a") == "1");
}

TEST_CASE("core: delete inside a transaction can be rolled back") {
    KVStore s;
    s.set("a", "1");
    s.begin();
    CHECK(s.remove("a"));
    CHECK(!s.get("a").has_value());
    s.rollback();
    CHECK(s.get("a") == "1");
}

TEST_CASE("core: delete then set inside a transaction") {
    KVStore s;
    s.set("a", "1");
    s.begin();
    s.remove("a");
    s.set("a", "5");
    s.commit();
    CHECK(s.get("a") == "5");
}

TEST_CASE("core: committed delete removes the key") {
    KVStore s;
    s.set("a", "1");
    s.begin();
    s.remove("a");
    s.commit();
    CHECK(!s.get("a").has_value());
    CHECK_FALSE(s.remove("a"));
}

TEST_CASE("edge: rollback and commit without a transaction throw") {
    KVStore s;
    CHECK_THROWS_AS(s.rollback(), std::logic_error);
    s.begin();
    s.commit();
    CHECK_THROWS_AS(s.commit(), std::logic_error);
}

TEST_CASE("edge: removing a missing key inside a transaction") {
    KVStore s;
    s.begin();
    CHECK_FALSE(s.remove("nope"));
    s.commit();
    CHECK(!s.get("nope").has_value());
}

TEST_CASE("core: many nested levels") {
    KVStore s;
    for (int i = 0; i < 200; i++) {
        s.begin();
        s.set("k" + std::to_string(i), std::to_string(i));
    }
    CHECK(s.depth() == 200);
    CHECK(s.get("k0") == "0");
    CHECK(s.get("k199") == "199");
    for (int i = 0; i < 100; i++) s.rollback();
    CHECK(s.get("k99") == "99");
    CHECK(!s.get("k100").has_value());
    for (int i = 0; i < 100; i++) s.commit();
    CHECK(s.depth() == 0);
    CHECK(s.get("k50") == "50");
}
