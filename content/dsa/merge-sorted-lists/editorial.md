## Intuition

Whatever comes first in the merged list must be the smaller of the two heads, because each list is already sorted. Taking it leaves the same problem on shorter lists.

## Approach

Walk both lists at once with a **dummy head** to avoid special-casing the first node.

1. Create a dummy node and a `tail` pointer that starts there.
2. While both lists have nodes, link the smaller current node (preferring `a` on ties) after `tail`, advance that list, and move `tail` forward.
3. When one list is exhausted, link the remainder of the other list. It is already sorted and needs no further work.
4. Return `dummy.next`.

## Complexity

Time $O(n + m)$ for lists of length $n$ and $m$. Extra space $O(1)$, since the existing nodes are reused.

A recursive version has the same time cost but uses $O(n + m)$ stack space, which risks overflow for 100,000 nodes in some languages.

## Pitfalls and edge cases

- **Empty lists.** One or both heads can be null. The dummy node handles these without special cases.
- **Forgetting the remainder.** After the loop one list may still have nodes; attach them.
- **Equal values.** Use `<` (not `<=`) when deciding to take from `b`, so ties come from `a` first.
- **Losing the head.** Return `dummy.next`, not the node `tail` ended on.
