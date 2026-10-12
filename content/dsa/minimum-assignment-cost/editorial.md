## Intuition

Trying all $n!$ assignments is hopeless beyond $n \approx 10$. But notice that if you hand out tasks to workers in a fixed order (worker 0 first, then 1, ...), the cost of finishing depends only on **which tasks are still free**, not on how the earlier tasks were distributed. Many different histories lead to the same set of taken tasks, so they can share one answer. A subset of $n$ tasks fits in an $n$-bit mask.

## Approach

Let `dp[mask]` be the minimum cost of giving the tasks in `mask` to the first `popcount(mask)` workers.

1. `dp[0] = 0`; all other entries start at infinity.
2. For each `mask` in increasing order, the next worker is `w = popcount(mask)`. For every task `t` not in `mask`, relax `dp[mask | (1 << t)]` with `dp[mask] + cost[w][t]`.
3. The answer is `dp[(1 << n) - 1]`.

## Complexity

There are $2^n$ states and each tries up to $n$ tasks: time $O(2^n \cdot n)$, space $O(2^n)$. For $n = 14$ that is about 230,000 steps, instant. The factorial brute force would need $14! \approx 8.7 \cdot 10^{10}$.

(For large $n$, the Hungarian algorithm solves the same problem in $O(n^3)$; the bitmask DP is the right tool when $n$ is small and the structure is less regular.)

## Pitfalls and edge cases

- **Which worker is next.** It is `popcount(mask)`; don't loop over workers inside each state.
- **Iterate masks in increasing order** so every state is final before it is used.
- **Initialization.** Use a large sentinel, but avoid overflow when adding to it.
- **$n = 1$:** a single worker takes the single task.
