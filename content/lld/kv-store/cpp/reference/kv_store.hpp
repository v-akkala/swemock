#pragma once
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

class KVStore {
public:
    void set(const std::string& key, const std::string& value) {
        if (overlays_.empty()) data_[key] = value;
        else overlays_.back()[key] = value;
    }

    std::optional<std::string> get(const std::string& key) const {
        for (auto it = overlays_.rbegin(); it != overlays_.rend(); ++it) {
            auto f = it->find(key);
            if (f != it->end()) return f->second;  // an empty optional is a tombstone
        }
        auto f = data_.find(key);
        if (f == data_.end()) return std::nullopt;
        return f->second;
    }

    bool remove(const std::string& key) {
        bool existed = get(key).has_value();
        if (existed) {
            if (overlays_.empty()) data_.erase(key);
            else overlays_.back()[key] = std::nullopt;
        }
        return existed;
    }

    void begin() { overlays_.emplace_back(); }

    void commit() {
        auto top = pop();
        for (auto& [key, value] : top) {
            if (!overlays_.empty()) overlays_.back()[key] = value;
            else if (value) data_[key] = *value;
            else data_.erase(key);
        }
    }

    void rollback() { pop(); }

    int depth() const { return static_cast<int>(overlays_.size()); }

    int count(const std::string& value) const {
        std::set<std::string> keys;
        for (auto& [k, v] : data_) keys.insert(k);
        for (auto& overlay : overlays_)
            for (auto& [k, v] : overlay) keys.insert(k);
        int n = 0;
        for (auto& k : keys) {
            auto v = get(k);
            if (v && *v == value) n++;
        }
        return n;
    }

private:
    using Overlay = std::map<std::string, std::optional<std::string>>;

    Overlay pop() {
        if (overlays_.empty()) throw std::logic_error("no open transaction");
        Overlay top = std::move(overlays_.back());
        overlays_.pop_back();
        return top;
    }

    std::unordered_map<std::string, std::string> data_;
    std::vector<Overlay> overlays_;
};
