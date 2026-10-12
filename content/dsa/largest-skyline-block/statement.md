A skyline is made of `n` buildings standing side by side, each one unit wide. Building `i` has height `heights[i]`.

A **block** is a rectangle that covers a run of consecutive buildings and fits entirely inside them: its width is the number of buildings in the run, and its height is at most the shortest building in the run. Return the largest possible **area** of a block.

## Examples

**Example 1**

```
Input:  heights = [2, 1, 5, 6, 2, 3]
Output: 10
```

The buildings of heights $5$ and $6$ form a block of width $2$ and height $5$, area $10$.

**Example 2**

```
Input:  heights = [4, 4, 4]
Output: 12
```

**Example 3**

```
Input:  heights = [0, 3, 0]
Output: 3
```

## Constraints

- $1 \le n \le 5 \cdot 10^4$
- $0 \le \text{heights}[i] \le 10^4$
- The area can exceed the range of a 32-bit integer in other settings; return a 64-bit value.
