## Intuition

Prefix sums answer range queries instantly but make updates cost $O(n)$, because one change shifts every later prefix. Re-summing the range on each query makes queries $O(n)$ instead. A **Fenwick tree** (binary indexed tree) balances the two: each cell stores the sum of a block whose size is the lowest set bit of its index, so both updates and prefix queries touch only $O(\log n)$ cells.

## Approach

Keep the current array (to know the old value at an index) and a Fenwick tree `tree` of size $n + 1$ (1-based).

- `add(i, delta)`: `while i <= n: tree[i] += delta; i += i & -i`.
- `prefix(i)` (sum of the first `i` elements): `while i > 0: s += tree[i]; i -= i & -i`.
- `update(index, value)`: `add(index + 1, value - nums[index])`, then store `nums[index] = value`.
- `rangeSum(left, right)`: `prefix(right + 1) - prefix(left)`.

Building by calling `add` for every element costs $O(n \log n)$; a linear-time build also exists.

A segment tree works equally well and generalizes to minimum, maximum, and range-update variants that a Fenwick tree handles less naturally.

## Complexity

Each operation is $O(\log n)$; space is $O(n)$. Recomputing `sum(nums[left:right+1])` for every query is $O(n)$ per query and too slow for tens of thousands of calls.

## Pitfalls and edge cases

- **Update by difference.** The tree stores sums, so add `value - old`, not `value`.
- **Index shift.** Fenwick trees are 1-based; convert carefully between 0-based indices and tree positions.
- **Inclusive right end.** `rangeSum(l, r)` uses `prefix(r + 1) - prefix(l)`.
- **Single element ranges** (`left == right`) and **repeated updates** to the same index must both work.
- **Negative numbers.** Sums and differences can be negative; use signed 64-bit integers.
