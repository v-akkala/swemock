## Intuition

Only the two biggest values matter, so there is no need to sort everything.

## Approach

Scan once, keeping the largest and second largest values seen so far.

## Complexity

Time $O(n)$, extra space $O(1)$.

## Pitfalls and edge cases

- Duplicates of the maximum: the second largest can equal the largest.
- All negative numbers: don't initialize the running maximums to $0$.
- The sum can exceed 32 bits ($2 \cdot 10^9$), so use a 64-bit result.
