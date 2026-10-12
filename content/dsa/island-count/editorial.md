## Intuition

An island is a connected component of land tiles. If you pick any land tile and explore everything reachable from it through land, you find exactly one whole island. So count how many times you have to start a fresh exploration.

## Approach

1. Scan the grid cell by cell.
2. When you see a land cell that has not been visited, increase the island count and flood-fill: explore its neighbors with a stack (DFS) or queue (BFS), marking every land cell you reach as visited.
3. Cells already visited belong to a counted island and are skipped.

You can mark visited cells in a separate boolean grid, or by overwriting the input with `'0'` if modifying it is allowed.

## Complexity

Each cell is pushed and popped a constant number of times: time $O(R \cdot C)$, space $O(R \cdot C)$ for the visited marks and the worst-case stack or queue.

## Pitfalls and edge cases

- **Recursion depth.** An island can snake through 45,000 cells. A recursive DFS may overflow the call stack in some languages; use an explicit stack or BFS.
- **Mark when you push, not when you pop.** Otherwise a cell can be queued many times.
- **Bounds.** Check the row and column ranges before reading a neighbor.
- **Diagonals do not connect.** Only four directions count.
- **Characters, not numbers.** The cells are the characters `'0'` and `'1'`.
