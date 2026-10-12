There are `n` courses numbered `0` to `n - 1`. Each entry `[a, b]` in `prerequisites` means course `b` must be completed **before** course `a`.

Return an order in which you can take all the courses so that every prerequisite is satisfied. If several orders work, return any one of them. If it is impossible (the prerequisites contain a cycle), return an empty list.

## Examples

**Example 1**

```
Input:  n = 4, prerequisites = [[1, 0], [2, 0], [3, 1], [3, 2]]
Output: [0, 1, 2, 3]
```

`[0, 2, 1, 3]` is also accepted.

**Example 2**

```
Input:  n = 2, prerequisites = [[0, 1], [1, 0]]
Output: []
```

Each course requires the other.

**Example 3**

```
Input:  n = 3, prerequisites = []
Output: [0, 1, 2]
```

Any permutation is accepted.

## Constraints

- $1 \le n \le 10^4$
- $0 \le \text{prerequisites.length} \le 3 \cdot 10^4$
- Each pair `[a, b]` has $0 \le a, b < n$. A pair with $a = b$ is a cycle.
- All pairs are distinct.
