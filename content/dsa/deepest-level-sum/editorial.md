## Intuition

"Deepest level" asks for the last group in a level-by-level view of the tree, and breadth-first search produces exactly that view.

## Approach

1. If the tree is empty, return 0.
2. Start with the list `[root]`. Repeat: compute the sum of the current level's values, then build the next level from the children of the current level's nodes.
3. When the next level is empty, the sum you just computed belongs to the deepest level; return it.

## Complexity

Time $O(n)$ because each node is visited once. Space $O(w)$ where $w$ is the widest level, up to $O(n)$.

A depth-first version works too: track the best depth seen and a running sum for it, resetting the sum when a deeper node appears. Recursion can overflow on a degenerate (linked-list-shaped) tree with $5 \cdot 10^4$ levels, so an explicit stack or BFS is safer.

## Pitfalls and edge cases

- **Empty tree.** Return 0 before touching `root`.
- **Single node.** The root is the deepest level; return its value.
- **Negative values.** Sums can be negative; do not initialize a "best" to 0 and compare against it.
- **Skewed trees.** A chain of $10^5$ nodes has $5 \cdot 10^4$ levels of one node each; avoid deep recursion.
