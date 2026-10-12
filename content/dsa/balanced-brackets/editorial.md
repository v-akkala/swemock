## Intuition

Whichever bracket was opened last must be closed first. "Last in, first out" is exactly the behavior of a stack.

## Approach

Scan the string once with a stack of unmatched openers.

1. Opening bracket: push it.
2. Closing bracket: if the stack is empty, or its top is not the matching opener, the string is unbalanced. Otherwise pop.
3. Any other character: skip it.
4. After the scan the stack must be empty; leftover openers were never closed.

## Complexity

Time $O(n)$, space $O(n)$ for the stack in the worst case (a long run of openers).

A tempting alternative is to keep deleting `()`, `[]` and `{}` pairs from the string until nothing changes. It is correct, but each pass costs $O(n)$ and a deeply nested string needs $\Theta(n)$ passes, so it is $O(n^2)$ and times out on long inputs.

## Pitfalls and edge cases

- **Closer on an empty stack**, such as `")("` or a leading `]`: check emptiness before popping.
- **Leftover openers**, such as `"(("`: remember the final emptiness check.
- **Interleaved kinds**, such as `"([)]"`: counting each kind separately gets this wrong; you need the stack's order.
- **Empty string and strings without brackets** are balanced.
