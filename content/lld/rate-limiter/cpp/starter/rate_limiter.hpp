#pragma once
#include <functional>
#include <stdexcept>
#include <string>

// A per-key token bucket rate limiter. See the spec for the contract.
// Keep the implementation in this header (inline) so the tests can include it.
class RateLimiter {
public:
    RateLimiter(double capacity, double refillPerSecond, std::function<double()> clock) { throw std::logic_error("not implemented"); }
    bool allow(const std::string& key, double cost = 1) { throw std::logic_error("not implemented"); }
    double tokens(const std::string& key) { throw std::logic_error("not implemented"); }
};
