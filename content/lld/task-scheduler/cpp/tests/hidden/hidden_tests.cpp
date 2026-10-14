#include <stdexcept>
#include <string>
#include <vector>

#include "doctest.h"
#include "scheduler.hpp"

TEST_CASE("core: equal priorities run in insertion order") {
    TaskScheduler s;
    for (auto n : {"c", "a", "b"}) s.add(n, 5);
    CHECK(s.nextTask() == "c");
    CHECK(s.nextTask() == "a");
    CHECK(s.nextTask() == "b");
}

TEST_CASE("core: a chain runs one step at a time") {
    TaskScheduler s;
    s.add("a", 1);
    s.add("b", 1, {"a"});
    s.add("c", 1, {"b"});
    for (std::string n : {"a", "b", "c"}) {
        CHECK(s.nextTask() == n);
        CHECK(!s.nextTask().has_value());
        s.complete(n);
    }
}

TEST_CASE("core: a task with two dependencies needs both") {
    TaskScheduler s;
    s.add("x", 1);
    s.add("y", 1);
    s.add("z", 9, {"x", "y"});
    CHECK(s.nextTask() == "x");
    s.complete("x");
    CHECK(s.status("z") == "waiting");
    CHECK(s.nextTask() == "y");
    s.complete("y");
    CHECK(s.nextTask() == "z");
}

TEST_CASE("core: newly ready tasks compete by priority") {
    TaskScheduler s;
    s.add("root", 1);
    s.add("low", 2, {"root"});
    s.add("high", 8, {"root"});
    s.add("other", 5);
    CHECK(s.nextTask() == "other");
    CHECK(s.nextTask() == "root");
    s.complete("root");
    CHECK(s.nextTask() == "high");
    CHECK(s.nextTask() == "low");
}

TEST_CASE("core: depending on a finished task is immediately ready") {
    TaskScheduler s;
    s.add("a", 1);
    s.nextTask();
    s.complete("a");
    s.add("b", 1, {"a"});
    CHECK(s.status("b") == "ready");
}

TEST_CASE("core: negative and zero priorities order correctly") {
    TaskScheduler s;
    s.add("neg", -5);
    s.add("zero", 0);
    s.add("pos", 3);
    CHECK(s.nextTask() == "pos");
    CHECK(s.nextTask() == "zero");
    CHECK(s.nextTask() == "neg");
}

TEST_CASE("edge: unknown dependency registers nothing") {
    TaskScheduler s;
    s.add("a", 1);
    CHECK_THROWS_AS(s.add("b", 1, {"a", "ghost"}), std::invalid_argument);
    CHECK_THROWS_AS(s.status("b"), std::out_of_range);
    s.add("b", 1);
}

TEST_CASE("edge: complete requires a running task") {
    TaskScheduler s;
    s.add("a", 1);
    CHECK_THROWS_AS(s.complete("a"), std::invalid_argument);
    CHECK_THROWS_AS(s.complete("nope"), std::invalid_argument);
    s.nextTask();
    s.complete("a");
    CHECK_THROWS_AS(s.complete("a"), std::invalid_argument);
}

TEST_CASE("edge: duplicate dependencies count once") {
    TaskScheduler s;
    s.add("a", 1);
    s.add("b", 1, {"a", "a"});
    s.nextTask();
    s.complete("a");
    CHECK(s.status("b") == "ready");
}

TEST_CASE("core: many tasks stay fast and ordered") {
    TaskScheduler s;
    for (int i = 0; i < 3000; i++) {
        std::vector<std::string> deps;
        if (i % 3 == 1) deps.push_back("t" + std::to_string(i - 1));
        s.add("t" + std::to_string(i), i % 10, deps);
    }
    int done = 0;
    while (auto t = s.nextTask()) {
        s.complete(*t);
        done++;
    }
    CHECK(done == 3000);
}
