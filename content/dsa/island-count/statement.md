A map is a grid of characters: `'1'` is a land tile and `'0'` is water. An **island** is a maximal group of land tiles connected through shared edges (up, down, left, or right; diagonals do not connect tiles).

Return the number of islands in the grid.

## Examples

**Example 1**

```
Input:  grid = [
  ["1", "1", "0", "0"],
  ["1", "0", "0", "1"],
  ["0", "0", "1", "1"]
]
Output: 2
```

**Example 2**

```
Input:  grid = [["1", "0", "1"], ["0", "1", "0"], ["1", "0", "1"]]
Output: 5
```

Diagonal tiles are not connected, so each land tile is its own island.

**Example 3**

```
Input:  grid = [["0", "0"], ["0", "0"]]
Output: 0
```

## Constraints

- $1 \le \text{rows}, \text{cols} \le 300$
- Every cell is `'0'` or `'1'`.
- The grid is rectangular.
