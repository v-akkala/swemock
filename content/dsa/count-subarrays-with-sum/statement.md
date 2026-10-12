Given an integer array `nums` and an integer `k`, return the number of non-empty **contiguous** subarrays whose elements add up to exactly `k`.

Subarrays are counted by position: two subarrays with the same values at different positions are different. The array may contain negative numbers and zeros.

## Examples

**Example 1**

```
Input:  nums = [1, 1, 1], k = 2
Output: 2
```

The subarrays are `nums[0..1]` and `nums[1..2]`.

**Example 2**

```
Input:  nums = [3, -3, 3], k = 0
Output: 2
```

`[3, -3]` and `[-3, 3]` both sum to $0$.

**Example 3**

```
Input:  nums = [0, 0, 0], k = 0
Output: 6
```

## Constraints

- $1 \le \text{nums.length} \le 10^5$
- $-10^4 \le \text{nums}[i] \le 10^4$
- $-10^9 \le k \le 10^9$
- The answer can exceed the range of a 32-bit integer.
