#include <stdexcept>
#include <string>

#include "doctest.h"
#include "rate_limiter.hpp"

namespace {
struct Clock {
    double now = 100;
    std::function<double()> fn() { return [this] { return now; }; }
};
}  // namespace

TEST_CASE("core: cost spends that many tokens") {
    Clock clock;
    RateLimiter limiter(10, 0, clock.fn());
    CHECK(limiter.allow("u", 4));
    CHECK(limiter.tokens("u") == 6);
    CHECK(limiter.allow("u", 6));
    CHECK_FALSE(limiter.allow("u", 1));
}

TEST_CASE("core: refill is capped at capacity") {
    Clock clock;
    RateLimiter limiter(5, 2, clock.fn());
    CHECK(limiter.allow("u", 5));
    clock.now += 1000;
    CHECK(limiter.tokens("u") == 5);
}

TEST_CASE("core: fractional refill accumulates") {
    Clock clock;
    RateLimiter limiter(2, 0.5, clock.fn());
    CHECK(limiter.allow("u", 2));
    clock.now += 1;
    CHECK_FALSE(limiter.allow("u"));
    clock.now += 1;
    CHECK(limiter.allow("u"));
}

TEST_CASE("core: many keys") {
    Clock clock;
    RateLimiter limiter(3, 1, clock.fn());
    for (int i = 0; i < 500; i++) CHECK(limiter.allow("user" + std::to_string(i)));
    for (int i = 0; i < 500; i++) CHECK(limiter.tokens("user" + std::to_string(i)) == 2);
}

TEST_CASE("edge: denied request spends nothing") {
    Clock clock;
    RateLimiter limiter(3, 0, clock.fn());
    CHECK_FALSE(limiter.allow("u", 4));
    CHECK(limiter.tokens("u") == 3);
    CHECK(limiter.allow("u", 3));
}

TEST_CASE("edge: clock going backwards adds no tokens") {
    Clock clock;
    RateLimiter limiter(2, 1, clock.fn());
    CHECK(limiter.allow("u", 2));
    clock.now -= 50;
    CHECK_FALSE(limiter.allow("u"));
    clock.now += 50;
    CHECK_FALSE(limiter.allow("u"));
    clock.now += 1;
    CHECK(limiter.allow("u"));
}

TEST_CASE("edge: non-positive cost is rejected") {
    Clock clock;
    RateLimiter limiter(3, 1, clock.fn());
    CHECK_THROWS_AS(limiter.allow("u", 0), std::invalid_argument);
    CHECK_THROWS_AS(limiter.allow("u", -1), std::invalid_argument);
}
