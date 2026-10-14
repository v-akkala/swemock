#pragma once
#include <algorithm>
#include <functional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>

class RateLimiter {
public:
    RateLimiter(double capacity, double refillPerSecond, std::function<double()> clock)
        : capacity_(capacity), rate_(refillPerSecond), clock_(std::move(clock)) {
        validate(capacity, refillPerSecond);
    }

    bool allow(const std::string& key, double cost = 1) {
        if (cost <= 0) throw std::invalid_argument("cost must be positive");
        Bucket& b = refilled(key);
        if (b.tokens < cost) return false;
        b.tokens -= cost;
        return true;
    }

    double tokens(const std::string& key) { return refilled(key).tokens; }

    void setLimit(const std::string& key, double capacity, double refillPerSecond) {
        validate(capacity, refillPerSecond);
        overrides_[key] = {capacity, refillPerSecond};
        if (buckets_.find(key) == buckets_.end()) return;  // created lazily later, full, with this limit
        Bucket& b = refilled(key);  // bring the bucket up to date under the old limit first
        b.capacity = capacity;
        b.rate = refillPerSecond;
        b.tokens = std::min(b.tokens, capacity);
    }

private:
    struct Bucket {
        double tokens;
        double lastUpdate;
        double capacity;
        double rate;
    };

    static void validate(double capacity, double refillPerSecond) {
        if (capacity <= 0) throw std::invalid_argument("capacity must be positive");
        if (refillPerSecond < 0) throw std::invalid_argument("refillPerSecond must not be negative");
    }

    Bucket& refilled(const std::string& key) {
        double now = clock_();
        auto it = buckets_.find(key);
        if (it == buckets_.end()) {
            auto o = overrides_.find(key);
            double cap = o == overrides_.end() ? capacity_ : o->second.first;
            double rate = o == overrides_.end() ? rate_ : o->second.second;
            return buckets_[key] = Bucket{cap, now, cap, rate};
        }
        Bucket& b = it->second;
        double elapsed = std::max(0.0, now - b.lastUpdate);
        b.tokens = std::min(b.capacity, b.tokens + elapsed * b.rate);
        b.lastUpdate = std::max(b.lastUpdate, now);
        return b;
    }

    double capacity_;
    double rate_;
    std::function<double()> clock_;
    std::unordered_map<std::string, Bucket> buckets_;
    std::unordered_map<std::string, std::pair<double, double>> overrides_;
};
