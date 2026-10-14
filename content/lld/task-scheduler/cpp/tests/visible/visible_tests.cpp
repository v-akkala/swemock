#include <stdexcept>
#include <string>

#include "doctest.h"
#include "scheduler.hpp"

TEST_CASE("core: highest priority runs first") {
    TaskScheduler s;
    s.add("low", 1);
    s.add("high", 9);
    s.add("mid", 5);
    CHECK(s.nextTask() == "high");
    CHECK(s.nextTask() == "mid");
    CHECK(s.nextTask() == "low");
    CHECK(!s.nextTask().has_value());
}

TEST_CASE("core: a task waits for its dependencies") {
    TaskScheduler s;
    s.add("a", 1);
    s.add("b", 100, {"a"});
    CHECK(s.status("b") == "waiting");
    CHECK(s.nextTask() == "a");
    CHECK(!s.nextTask().has_value());
    s.complete("a");
    CHECK(s.status("b") == "ready");
    CHECK(s.nextTask() == "b");
}

TEST_CASE("core: status follows the lifecycle") {
    TaskScheduler s;
    s.add("a", 1);
    CHECK(s.status("a") == "ready");
    s.nextTask();
    CHECK(s.status("a") == "running");
    s.complete("a");
    CHECK(s.status("a") == "done");
}

TEST_CASE("edge: duplicate ids are rejected") {
    TaskScheduler s;
    s.add("a", 1);
    CHECK_THROWS_AS(s.add("a", 2), std::invalid_argument);
}
