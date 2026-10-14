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

TEST_CASE("extension: override applies to that key only") {
    Clock clock;
    RateLimiter limiter(2, 0, clock.fn());
    limiter.setLimit("vip", 5, 0);
    CHECK(limiter.tokens("other") == 2);
    for (int i = 0; i < 5; i++) CHECK(limiter.allow("vip"));
    CHECK_FALSE(limiter.allow("vip"));
}

TEST_CASE("extension: override before the first request starts full") {
    Clock clock;
    RateLimiter limiter(2, 0, clock.fn());
    limiter.setLimit("vip", 9, 0);
    CHECK(limiter.tokens("vip") == 9);
}

TEST_CASE("extension: lowering capacity caps current tokens") {
    Clock clock;
    RateLimiter limiter(10, 0, clock.fn());
    CHECK(limiter.allow("u"));
    limiter.setLimit("u", 3, 0);
    CHECK(limiter.tokens("u") == 3);
}

TEST_CASE("extension: raising capacity keeps tokens and uses the new rate") {
    Clock clock;
    RateLimiter limiter(2, 1, clock.fn());
    CHECK(limiter.allow("u", 2));
    limiter.setLimit("u", 10, 2);
    CHECK(limiter.tokens("u") == 0);
    clock.now = 3;
    CHECK(limiter.tokens("u") == 6);
}

TEST_CASE("extension: setLimit validates like the constructor") {
    Clock clock;
    RateLimiter limiter(2, 1, clock.fn());
    CHECK_THROWS_AS(limiter.setLimit("u", 0, 1), std::invalid_argument);
    CHECK_THROWS_AS(limiter.setLimit("u", 1, -1), std::invalid_argument);
}
