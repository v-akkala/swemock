## Intuition

Think of courses as nodes and prerequisites as directed edges. A valid order is a **topological order** of this graph, and one exists exactly when the graph has no cycle. The first course must be one with no prerequisites; once it is taken, courses that depended only on it become available.

## Approach (Kahn's algorithm)

1. Build adjacency lists from each prerequisite `b -> a` and count `indegree[a]` (the number of unmet prerequisites).
2. Put every course with indegree 0 into a queue.
3. Repeatedly take a course from the queue, append it to the order, and decrease the indegree of every course that depends on it. Courses reaching indegree 0 join the queue.
4. If the order contains all `n` courses, return it. Otherwise the remaining courses sit on or behind a cycle: return `[]`.

A depth-first search that appends nodes in reverse finishing order also works, with an extra "currently visiting" state to detect cycles.

## Complexity

Time $O(n + m)$ and space $O(n + m)$, where $m$ is the number of prerequisites.

## Pitfalls and edge cases

- **Edge direction.** `[a, b]` means `b` comes first; mixing this up reverses the order.
- **Cycles hide in one corner.** The queue can still empty out early while other courses remain; always compare the order's length with `n`.
- **Self-prerequisite** `[a, a]` is a cycle of length one.
- **Isolated courses** with no edges must still appear in the output.
- **Recursion depth.** A chain of 10,000 courses can overflow a recursive DFS in some languages.
