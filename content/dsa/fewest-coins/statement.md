You have an unlimited supply of coins of the denominations listed in `coins`. Return the **smallest number of coins** that add up to exactly `amount`. If no combination of coins makes that amount, return `-1`.

An amount of `0` needs zero coins.

## Examples

**Example 1**

```
Input:  coins = [1, 2, 5], amount = 11
Output: 3
```

$11 = 5 + 5 + 1$.

**Example 2**

```
Input:  coins = [2], amount = 3
Output: -1
```

**Example 3**

```
Input:  coins = [1, 3, 4], amount = 6
Output: 2
```

$6 = 3 + 3$. Greedily taking the largest coin first would give $4 + 1 + 1 = 3$ coins.

## Constraints

- $1 \le \text{coins.length} \le 100$
- $1 \le \text{coins}[i] \le 5000$, and all values are distinct.
- $0 \le \text{amount} \le 10^4$
