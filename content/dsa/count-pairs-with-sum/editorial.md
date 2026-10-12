## Intuition

A pair $(i, j)$ is valid exactly when $\text{nums}[j] = \text{target} - \text{nums}[i]$. If you fix the later index $j$, the question becomes: how many earlier elements equal $\text{target} - \text{nums}[j]$? A hash map answers that in constant time.

## Approach

1. Keep a map `counts` from value to the number of times it has appeared so far.
2. For each `x` in order, add `counts[target - x]` to the answer. Every earlier element that equals `target - x` forms one valid pair with this `x`.
3. Then increment `counts[x]`, so later elements can pair with it.

Counting only with *earlier* elements guarantees each pair $(i, j)$ with $i < j$ is counted once.

## Complexity

Time $O(n)$ expected, space $O(n)$ for the map. The brute force checks all $\binom{n}{2}$ pairs in $O(n^2)$ time, which is far too slow for $n = 10^5$.

## Pitfalls and edge cases

- **Overflow.** The answer reaches $\binom{10^5}{2} \approx 5 \cdot 10^9$, and `target - x` can reach $3 \cdot 10^9$. Use 64-bit integers.
- **Equal values.** When `x` equals `target - x` (for example `[2, 2, 2, 2]` with target 4), look up the count *before* inserting `x`; otherwise an element would pair with itself.
- **No match.** Returning 0 is correct; do not treat it as an error.
