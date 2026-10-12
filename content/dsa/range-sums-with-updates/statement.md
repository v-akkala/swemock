Design a data structure that stores an integer array and supports two operations on it:

- `update(index, value)` replaces `nums[index]` with `value`.
- `rangeSum(left, right)` returns the sum of `nums[left]` through `nums[right]`, inclusive.

Implement the class `LiveSums`:

- `LiveSums(nums)` initializes the structure with the array `nums`.
- `update(index, value)` and `rangeSum(left, right)` as described above.

Both operations should run in $O(\log n)$ time. The tests describe a sequence of calls: the first operation is the constructor, and the output lists one result per call (`null` for the constructor and for `update`).

## Examples

**Example 1**

```
Operations: ["LiveSums", "rangeSum", "update", "rangeSum", "rangeSum"]
Arguments:  [[[3, -1, 4, 1, 5]], [0, 2], [1, 10], [0, 2], [1, 4]]
Output:     [null, 6, null, 17, 20]
```

Before the update, $3 + (-1) + 4 = 6$. After setting index 1 to $10$: $3 + 10 + 4 = 17$ and $10 + 4 + 1 + 5 = 20$.

**Example 2**

```
Operations: ["LiveSums", "rangeSum", "update", "rangeSum"]
Arguments:  [[[7]], [0, 0], [0, -7], [0, 0]]
Output:     [null, 7, null, -7]
```

## Constraints

- $1 \le \text{nums.length} \le 3 \cdot 10^4$
- $-10^4 \le \text{nums}[i], \text{value} \le 10^4$
- $0 \le \text{left} \le \text{right} < \text{nums.length}$ and $0 \le \text{index} < \text{nums.length}$
- At most $3 \cdot 10^4$ calls in total.
