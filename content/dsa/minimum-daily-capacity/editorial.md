## Intuition

Searching for the best way to *split* the packages is hard. Checking whether one given capacity *works* is easy: load the truck greedily and count days. And feasibility is monotone in the capacity: a bigger truck never needs more days. That makes this a "binary search on the answer" problem.

## Approach

1. **Bounds.** The capacity must be at least `max(weights)` (otherwise the heaviest package never ships) and at most `sum(weights)` (one trip carries everything).
2. **Feasibility check.** Walk through the packages, adding to the current day's load; when the next package would exceed the capacity, start a new day. Greedy is optimal because filling a day as much as possible never hurts later days.
3. **Binary search.** Find the smallest capacity in $[\max, \text{sum}]$ for which the check passes.

## Complexity

Each check is $O(n)$, and the search takes $O(\log(\text{sum}))$ steps, so time is $O(n \log(\text{sum}))$ with $O(1)$ extra space. Trying every capacity one by one costs $O(n \cdot \text{sum})$, far too slow.

## Pitfalls and edge cases

- **Lower bound.** Starting the search at 1 makes the check fail for reasons unrelated to the day count; start at `max(weights)`.
- **Infinite loops.** Use the half-open update `lo = mid + 1` / `hi = mid` with `mid = (lo + hi) // 2`.
- **`days` equals the number of packages.** The answer is `max(weights)`.
- **`days == 1`.** The answer is `sum(weights)`.
