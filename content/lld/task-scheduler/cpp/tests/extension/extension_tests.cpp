#include <stdexcept>
#include <string>
#include <vector>

#include "doctest.h"
#include "scheduler.hpp"

TEST_CASE("extension: cancel removes a task and its dependents") {
    TaskScheduler s;
    s.add("a", 1);
    s.add("b", 1, {"a"});
    s.add("c", 1, {"b"});
    s.add("d", 1);
    CHECK(s.cancel("a") == std::vector<std::string>{"a", "b", "c"});
    CHECK(s.status("a") == "cancelled");
    CHECK(s.status("c") == "cancelled");
    CHECK(s.status("d") == "ready");
    CHECK(s.nextTask() == "d");
    CHECK(!s.nextTask().has_value());
}

TEST_CASE("extension: cancelled ready tasks are never handed out") {
    TaskScheduler s;
    s.add("top", 9);
    s.add("next", 1);
    CHECK(s.cancel("top") == std::vector<std::string>{"top"});
    CHECK(s.nextTask() == "next");
}

TEST_CASE("extension: cancel returns ids in insertion order") {
    TaskScheduler s;
    s.add("root", 1);
    s.add("z", 1, {"root"});
    s.add("a", 1, {"root"});
    s.add("m", 1, {"z", "a"});
    CHECK(s.cancel("root") == std::vector<std::string>{"root", "z", "a", "m"});
}

TEST_CASE("extension: cancel rejects running done cancelled and unknown tasks") {
    TaskScheduler s;
    s.add("a", 1);
    s.add("b", 1);
    s.add("c", 1);
    s.nextTask();
    CHECK_THROWS_AS(s.cancel("a"), std::invalid_argument);
    s.complete("a");
    CHECK_THROWS_AS(s.cancel("a"), std::invalid_argument);
    s.cancel("b");
    CHECK_THROWS_AS(s.cancel("b"), std::invalid_argument);
    CHECK_THROWS_AS(s.cancel("ghost"), std::invalid_argument);
}
