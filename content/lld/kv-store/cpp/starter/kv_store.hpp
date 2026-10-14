#pragma once
#include <optional>
#include <stdexcept>
#include <string>

// An in-memory key-value store with nested transactions. See the spec for the contract.
// Keep the implementation in this header (inline) so the tests can include it.
class KVStore {
public:
    void set(const std::string& key, const std::string& value) { throw std::logic_error("not implemented"); }
    std::optional<std::string> get(const std::string& key) const { throw std::logic_error("not implemented"); }
    bool remove(const std::string& key) { throw std::logic_error("not implemented"); }
    void begin() { throw std::logic_error("not implemented"); }
    void commit() { throw std::logic_error("not implemented"); }
    void rollback() { throw std::logic_error("not implemented"); }
    int depth() const { throw std::logic_error("not implemented"); }
};
