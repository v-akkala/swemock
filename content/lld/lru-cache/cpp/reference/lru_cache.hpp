#pragma once
#include <functional>
#include <list>
#include <optional>
#include <stdexcept>
#include <unordered_map>
#include <vector>

class LRUCache {
public:
    using Clock = std::function<double()>;

    explicit LRUCache(int capacity, Clock clock = [] { return 0.0; }) : capacity_(capacity), clock_(std::move(clock)) {
        if (capacity < 1) throw std::invalid_argument("capacity must be at least 1");
    }

    std::optional<int> get(int key) {
        auto it = index_.find(key);
        if (it == index_.end()) return std::nullopt;
        if (expired(*it->second)) {
            erase(it);
            return std::nullopt;
        }
        order_.splice(order_.begin(), order_, it->second);
        return it->second->value;
    }

    void put(int key, int value, std::optional<double> ttl = std::nullopt) {
        std::optional<double> expires;
        if (ttl) expires = clock_() + *ttl;
        auto it = index_.find(key);
        if (it != index_.end()) {
            it->second->value = value;
            it->second->expires = expires;
            order_.splice(order_.begin(), order_, it->second);
            return;
        }
        purge();
        if (static_cast<int>(index_.size()) >= capacity_) erase(index_.find(order_.back().key));
        order_.push_front({key, value, expires});
        index_[key] = order_.begin();
    }

    int size() {
        purge();
        return static_cast<int>(index_.size());
    }

    std::vector<int> keys() {
        purge();
        std::vector<int> out;
        for (const auto& e : order_) out.push_back(e.key);
        return out;
    }

private:
    struct Entry {
        int key;
        int value;
        std::optional<double> expires;
    };

    bool expired(const Entry& e) const { return e.expires && clock_() >= *e.expires; }

    void erase(std::unordered_map<int, std::list<Entry>::iterator>::iterator it) {
        order_.erase(it->second);
        index_.erase(it);
    }

    void purge() {
        for (auto it = index_.begin(); it != index_.end();) {
            if (expired(*it->second)) {
                order_.erase(it->second);
                it = index_.erase(it);
            } else {
                ++it;
            }
        }
    }

    int capacity_;
    Clock clock_;
    std::list<Entry> order_;  // front = most recently used
    std::unordered_map<int, std::list<Entry>::iterator> index_;
};
