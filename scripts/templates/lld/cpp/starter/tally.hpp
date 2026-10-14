#pragma once
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// Counts how many times each key was added. See the spec for the full contract.
// Keep the implementation in this header (inline) so the tests can include it.
class Tally {
public:
    void add(const std::string& key, int n = 1) { throw std::logic_error("not implemented"); }
    int get(const std::string& key) const { throw std::logic_error("not implemented"); }
    std::vector<std::pair<std::string, int>> top(int k) const { throw std::logic_error("not implemented"); }
};
