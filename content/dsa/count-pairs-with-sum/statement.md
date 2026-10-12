You are given an integer array `nums` and an integer `target`. Count the index pairs $(i, j)$ with $i < j$ such that $\text{nums}[i] + \text{nums}[j] = \text{target}$.

Two pairs are different if they use different indices, even when the values are the same.

## Examples

**Example 1**

```
Input:  nums = [1, 5, 7, -1, 5], target = 6
Output: 3
```

The pairs are $(0, 1)$, $(0, 4)$ and $(2, 3)$: values $1+5$, $1+5$ and $7+(-1)$.

**Example 2**

```
Input:  nums = [2, 2, 2, 2], target = 4
Output: 6
```

Every choice of two indices works, and there are $\binom{4}{2} = 6$ of them.

**Example 3**

```
Input:  nums = [1, 2, 3], target = 10
Output: 0
```

## Constraints

- $1 \le \text{nums.length} \le 10^5$
- $-10^9 \le \text{nums}[i] \le 10^9$
- $-2 \cdot 10^9 \le \text{target} \le 2 \cdot 10^9$
- The answer can exceed the range of a 32-bit integer.
