#pragma once
#include <algorithm>
#include <optional>
#include <queue>
#include <stdexcept>
#include <string>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <vector>

class TaskScheduler {
public:
    void add(const std::string& id, int priority, const std::vector<std::string>& dependsOn = {}) {
        if (tasks_.count(id)) throw std::invalid_argument("task already exists: " + id);
        std::unordered_set<std::string> seen;
        std::vector<std::string> pending;
        for (const auto& d : dependsOn) {
            auto it = tasks_.find(d);
            if (it == tasks_.end()) throw std::invalid_argument("unknown dependency: " + d);
            if (seen.insert(d).second && it->second.state != State::Done) pending.push_back(d);
        }
        Task task{priority, sequence_++, static_cast<int>(pending.size()), State::Waiting};
        for (const auto& d : pending) dependents_[d].push_back(id);
        tasks_[id] = task;
        if (task.missing == 0) makeReady(id);
    }

    std::optional<std::string> nextTask() {
        while (!ready_.empty()) {
            auto [negPriority, seq, id] = ready_.top();
            ready_.pop();
            Task& t = tasks_.at(id);
            if (t.state == State::Ready) {  // cancelled tasks are skipped lazily
                t.state = State::Running;
                return id;
            }
        }
        return std::nullopt;
    }

    void complete(const std::string& id) {
        auto it = tasks_.find(id);
        if (it == tasks_.end() || it->second.state != State::Running) throw std::invalid_argument("task is not running: " + id);
        it->second.state = State::Done;
        for (const auto& dep : dependents_[id]) {
            Task& d = tasks_.at(dep);
            if (d.state != State::Waiting) continue;
            if (--d.missing == 0) makeReady(dep);
        }
    }

    std::string status(const std::string& id) const {
        auto it = tasks_.find(id);
        if (it == tasks_.end()) throw std::out_of_range("unknown task: " + id);
        switch (it->second.state) {
            case State::Waiting: return "waiting";
            case State::Ready: return "ready";
            case State::Running: return "running";
            case State::Done: return "done";
            case State::Cancelled: return "cancelled";
        }
        return "";
    }

    std::vector<std::string> cancel(const std::string& id) {
        auto it = tasks_.find(id);
        if (it == tasks_.end() || (it->second.state != State::Waiting && it->second.state != State::Ready))
            throw std::invalid_argument("task cannot be cancelled: " + id);
        std::vector<std::string> cancelled;
        std::vector<std::string> stack{id};
        while (!stack.empty()) {
            std::string cur = stack.back();
            stack.pop_back();
            Task& t = tasks_.at(cur);
            if (t.state == State::Cancelled) continue;
            t.state = State::Cancelled;
            cancelled.push_back(cur);
            for (const auto& d : dependents_[cur]) stack.push_back(d);
        }
        std::sort(cancelled.begin(), cancelled.end(), [&](const std::string& a, const std::string& b) { return tasks_.at(a).sequence < tasks_.at(b).sequence; });
        return cancelled;
    }

private:
    enum class State { Waiting, Ready, Running, Done, Cancelled };
    struct Task {
        int priority;
        long sequence;
        int missing;
        State state;
    };
    using Entry = std::tuple<int, long, std::string>;  // (-priority, sequence, id)

    void makeReady(const std::string& id) {
        Task& t = tasks_.at(id);
        t.state = State::Ready;
        ready_.push({-t.priority, t.sequence, id});
    }

    std::unordered_map<std::string, Task> tasks_;
    std::unordered_map<std::string, std::vector<std::string>> dependents_;
    std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> ready_;
    long sequence_ = 0;
};
