A crew has `n` workers and there are `n` tasks. Worker `i` would charge `cost[i][j]` to do task `j`. Every worker must be given exactly one task, and every task must be given to exactly one worker.

Return the smallest possible total cost of an assignment.

## Examples

**Example 1**

```
Input:  cost = [[9, 2, 7], [3, 6, 1], [5, 8, 4]]
Output: 8
```

Worker 0 takes task 1 (cost 2), worker 1 takes task 2 (cost 1), worker 2 takes task 0 (cost 5): $2 + 1 + 5 = 8$. No other assignment is cheaper.

**Example 2**

```
Input:  cost = [[4]]
Output: 4
```

**Example 3**

```
Input:  cost = [[1, 5], [5, 1]]
Output: 2
```

## Constraints

- $1 \le n \le 14$, and `cost` is an $n \times n$ matrix.
- $0 \le \text{cost}[i][j] \le 1000$
