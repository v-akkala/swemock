# Design notes

Scheduling with dependencies is a topological ordering driven by a priority queue. The two pieces of state that make it cheap are:

1. **A counter per task: how many dependencies are not done.** A task is ready exactly when its counter is zero. Completing a task decrements the counters of its dependents, found through a reverse-edge map (dependency to dependents). No rescans.
2. **A heap of ready tasks** keyed by `(-priority, sequence)`, where `sequence` is the insertion number. The highest priority wins, and equal priorities are first-come first-served. `next_task` pops the heap, so it is O(log n).

Each task record holds its priority, its state, and its counter. States are an enum, not strings sprinkled through the code; the public `status` converts at the edge.

- `add`: validate everything (duplicate id, unknown dependencies) **before** changing any state, so a failed `add` leaves nothing behind. Count only dependencies that are not already done. O(d log n).
- `complete`: O(dependents log n).
- **Cycles cannot form** because a dependency must already exist when a task is added. That rule is a design decision worth saying out loud: it trades flexibility for simplicity.

**What to avoid.** A `Task` class hierarchy, an event bus, or re-evaluating `all(dep.done for dep in deps)` for every task on every call (O(n·d) each time).

**The requirement change** (`cancel`) is a graph walk over the reverse edges plus lazy deletion from the heap: mark cancelled tasks, and skip them when popped, instead of searching the heap.
