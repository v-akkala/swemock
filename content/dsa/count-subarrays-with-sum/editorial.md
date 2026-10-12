## Intuition

Let $P[j]$ be the sum of the first $j$ elements ($P[0] = 0$). A subarray that starts after position $i$ and ends at position $j$ has sum $P[j] - P[i]$. It sums to $k$ exactly when $P[i] = P[j] - k$. So the question becomes: for each $j$, how many earlier prefix sums equal $P[j] - k$?

## Approach

1. Keep a hash map `counts` of how many times each prefix sum has occurred. Start with `counts[0] = 1` for the empty prefix.
2. Sweep through the array, maintaining the running prefix sum.
3. At each element, add `counts[prefix - k]` to the answer, then record the current prefix in `counts`.

Looking up *before* inserting guarantees that subarrays are non-empty.

## Complexity

Time $O(n)$ expected, space $O(n)$. The obvious double loop over all start and end positions is $O(n^2)$ and is too slow for $n = 10^5$.

Because values can be negative, a sliding window does not work here: adding an element can decrease the sum, so the window cannot be shrunk greedily.

## Pitfalls and edge cases

- **The empty prefix.** Without `counts[0] = 1`, subarrays that start at index 0 are missed.
- **Zeros and negatives.** Many subarrays can share the same sum. With all zeros and $k = 0$ the answer is $n(n+1)/2$, about $5 \cdot 10^9$, so use 64-bit counters.
- **Order of lookup and insert.** Insert the current prefix *after* looking it up, or an empty subarray gets counted when $k = 0$.
