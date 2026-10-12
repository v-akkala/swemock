## Intuition

The best way to pay an amount ends with some coin $c$, and what remains must itself be paid in the best possible way. So the answer for an amount is built from answers for smaller amounts, which is the shape of dynamic programming. Greedy choice (largest coin first) is not safe: with coins $\{1, 3, 4\}$ and amount $6$, greedy uses three coins but two suffice.

## Approach

1. Let `best[a]` be the fewest coins that make exactly `a`. Set `best[0] = 0` and everything else to infinity.
2. For `a` from `1` to `amount`, try each coin `c <= a`: `best[a] = min(best[a], best[a - c] + 1)`.
3. Return `best[amount]`, or `-1` if it is still infinity.

## Complexity

Time $O(\text{amount} \cdot m)$ for $m$ coin types and space $O(\text{amount})$. Plain recursion that tries every coin at every step, without remembering results, revisits the same amounts exponentially many times and times out quickly.

## Pitfalls and edge cases

- **Amount 0** is a valid input and needs 0 coins.
- **Unreachable amounts.** Use a large sentinel (such as `amount + 1`) so that `best[a - c] + 1` can't overflow or look reachable by accident.
- **Coins bigger than the amount** must be skipped.
- **Greedy is wrong** for general denominations; do not sort and take the biggest.
