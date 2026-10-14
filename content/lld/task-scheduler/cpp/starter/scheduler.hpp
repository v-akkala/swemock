#pragma once
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

// Hands out tasks by priority once their dependencies are done. See the spec for the contract.
// Keep the implementation in this header (inline) so the tests can include it.
class TaskScheduler {
public:
    void add(const std::string& id, int priority, const std::vector<std::string>& dependsOn = {}) { throw std::logic_error("not implemented"); }
    std::optional<std::string> nextTask() { throw std::logic_error("not implemented"); }
    void complete(const std::string& id) { throw std::logic_error("not implemented"); }
    std::string status(const std::string& id) const { throw std::logic_error("not implemented"); }
};
