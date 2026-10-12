## Intuition

The best block has some shortest building, and its height is exactly that building's height (making it any taller would stick out of the shortest one). So the answer is the maximum, over all buildings `i`, of `heights[i]` times the widest run around `i` in which `i` stays the shortest. That run is bounded by the nearest strictly shorter building on each side.

## Approach (monotonic stack)

1. Sweep left to right with a stack of indices whose heights are increasing.
2. For each new height (and a final sentinel height of $0$ to flush the stack), pop every index whose height is not smaller than the new one. When popping index `j`, the new index `i` is the nearest smaller on its right, and the element now on top of the stack is the nearest smaller on its left.
3. The block for `j` has width `i - (top + 1)` (or `i` if the stack is empty) and area `heights[j] * width`; track the maximum.
4. Push `i`.

## Complexity

Every index is pushed once and popped once: time $O(n)$, space $O(n)$. The obvious approach of expanding a block from every start to every end is $O(n^2)$ and times out at $n = 5 \cdot 10^4$.

## Pitfalls and edge cases

- **The final flush.** Bars left on the stack at the end still need their area computed; a sentinel height of $0$ does this.
- **Equal heights.** Pop when the stack top's height is greater than **or equal to** the current height (or handle ties consistently), otherwise widths may be miscounted.
- **Width after popping** is measured from the new stack top, not from the popped index.
- **Zero heights** split the skyline; the area of a block containing a zero is zero.
- **Overflow.** $5 \cdot 10^4 \times 10^4 = 5 \cdot 10^8$ fits in 32 bits here, but use 64-bit anyway.
