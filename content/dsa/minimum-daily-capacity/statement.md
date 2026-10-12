A warehouse must ship `n` packages that sit on a conveyor in a fixed order. Package `i` weighs `weights[i]`. Each day a truck takes packages from the front of the line, in order, as long as their total weight does not exceed the truck's **capacity**. Packages can't be reordered or split, and the truck makes exactly one trip per day.

Return the smallest truck capacity that lets the warehouse ship all packages within `days` days.

## Examples

**Example 1**

```
Input:  weights = [4, 2, 7, 1, 3, 9], days = 3
Output: 11
```

With capacity $11$: day 1 carries `[4, 2]`, day 2 carries `[7, 1, 3]`, day 3 carries `[9]`. With capacity $10$ the last two days cannot cover `[7, 1, 3, 9]`.

**Example 2**

```
Input:  weights = [5, 5, 5], days = 3
Output: 5
```

**Example 3**

```
Input:  weights = [8, 1, 1], days = 1
Output: 10
```

## Constraints

- $1 \le \text{days} \le \text{weights.length} \le 5 \cdot 10^4$
- $1 \le \text{weights}[i] \le 500$
