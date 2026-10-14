#pragma once
#include <algorithm>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

class Tally {
public:
    void add(const std::string& key, int n = 1) {
        if (n <= 0) throw std::invalid_argument("n must be positive");
        counts_[key] += n;
    }

    int get(const std::string& key) const {
        auto it = counts_.find(key);
        return it == counts_.end() ? 0 : it->second;
    }

    std::vector<std::pair<std::string, int>> top(int k) const {
        if (k <= 0) return {};
        std::vector<std::pair<std::string, int>> ranked(counts_.begin(), counts_.end());
        std::sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) {
            return a.second != b.second ? a.second > b.second : a.first < b.first;
        });
        if (static_cast<int>(ranked.size()) > k) ranked.resize(k);
        return ranked;
    }

    void remove(const std::string& key, int n = 1) {
        auto it = counts_.find(key);
        if (n <= 0 || it == counts_.end() || it->second < n) throw std::out_of_range(key);
        if (it->second == n) counts_.erase(it);
        else it->second -= n;
    }

private:
    std::map<std::string, int> counts_;
};
