You are given a list of closed ranges `ranges`, where `ranges[i] = [start, end]` covers every integer from `start` to `end` inclusive.

Two ranges **overlap** if they share at least one integer, so `[1, 3]` and `[3, 5]` overlap. Merge all overlapping ranges, repeating until no two ranges overlap, and return the result sorted by start. The input is not sorted.

## Examples

**Example 1**

```
Input:  ranges = [[8, 10], [1, 3], [2, 6], [15, 18]]
Output: [[1, 6], [8, 10], [15, 18]]
```

`[1, 3]` and `[2, 6]` overlap and merge into `[1, 6]`.

**Example 2**

```
Input:  ranges = [[1, 4], [4, 5]]
Output: [[1, 5]]
```

**Example 3**

```
Input:  ranges = [[1, 10], [2, 3], [4, 5]]
Output: [[1, 10]]
```

## Constraints

- $1 \le \text{ranges.length} \le 2 \cdot 10^4$
- $0 \le \text{start} \le \text{end} \le 10^7$
