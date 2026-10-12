## Intuition

If you look at the ranges in order of their start, any range that overlaps the merged range built so far must begin no later than that range's end. Ranges that begin after the end can't reach back, so a single left-to-right sweep suffices.

## Approach

1. Sort the ranges by start (and by end for ties; not required, but it keeps the result deterministic).
2. Put the first range in the output.
3. For each following range `[s, e]`, compare it with the last output range `[a, b]`:
   - if `s <= b` they overlap, so set `b = max(b, e)`;
   - otherwise append `[s, e]` as a new range.

## Complexity

Sorting dominates: $O(n \log n)$ time, $O(n)$ for the output. Comparing every pair of ranges and merging until nothing changes is $O(n^2)$ or worse and times out for $n = 2 \cdot 10^4$.

## Pitfalls and edge cases

- **Touching ranges merge.** `[1, 4]` and `[4, 5]` share the integer 4. Use `<=`, not `<`.
- **Nested ranges.** When the new range lies inside the current one, the end must not shrink; take the `max`.
- **Unsorted input.** The sweep is only valid after sorting.
- **Mutating input.** Copy ranges before extending them if your language shares the inner lists with the caller.
