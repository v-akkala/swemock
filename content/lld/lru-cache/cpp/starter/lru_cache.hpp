#pragma once
#include <functional>
#include <optional>
#include <stdexcept>
#include <vector>

// A fixed-capacity cache that evicts the least recently used entry. See the spec for the contract.
// Keep the implementation in this header (inline) so the tests can include it.
class LRUCache {
public:
    explicit LRUCache(int capacity) { throw std::logic_error("not implemented"); }
    std::optional<int> get(int key) { throw std::logic_error("not implemented"); }
    void put(int key, int value) { throw std::logic_error("not implemented"); }
    int size() const { throw std::logic_error("not implemented"); }
    std::vector<int> keys() const { throw std::logic_error("not implemented"); }
};
