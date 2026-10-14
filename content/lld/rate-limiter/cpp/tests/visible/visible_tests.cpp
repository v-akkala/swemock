#include <stdexcept>
#include <string>

#include "doctest.h"
#include "rate_limiter.hpp"

namespace {
struct Clock {
    double now = 0;
    std::function<double()> fn() { return [this] { return now; }; }
};
}  // namespace

TEST_CASE("core: allows up to capacity then denies") {
    Clock clock;
    RateLimiter limiter(3, 1, clock.fn());
    CHECK(limiter.allow("u"));
    CHECK(limiter.allow("u"));
    CHECK(limiter.allow("u"));
    CHECK_FALSE(limiter.allow("u"));
}

TEST_CASE("core: refills over time") {
    Clock clock;
    RateLimiter limiter(2, 1, clock.fn());
    CHECK(limiter.allow("u"));
    CHECK(limiter.allow("u"));
    CHECK_FALSE(limiter.allow("u"));
    clock.now = 1;
    CHECK(limiter.allow("u"));
    CHECK_FALSE(limiter.allow("u"));
}

TEST_CASE("core: keys are independent") {
    Clock clock;
    RateLimiter limiter(1, 0, clock.fn());
    CHECK(limiter.allow("a"));
    CHECK_FALSE(limiter.allow("a"));
    CHECK(limiter.allow("b"));
}

TEST_CASE("edge: rejects bad arguments") {
    Clock clock;
    CHECK_THROWS_AS(RateLimiter(0, 1, clock.fn()), std::invalid_argument);
    CHECK_THROWS_AS(RateLimiter(5, -1, clock.fn()), std::invalid_argument);
}
