You are given the heads of two singly linked lists, `a` and `b`. Each list is sorted in non-decreasing order.

Merge the two lists into one sorted list by splicing together the existing nodes, and return the head of the merged list. When both heads hold equal values, take the node from `a` first.

An empty list is represented by a null head.

## Examples

**Example 1**

```
Input:  a = [1, 2, 4], b = [1, 3, 4]
Output: [1, 1, 2, 3, 4, 4]
```

**Example 2**

```
Input:  a = [], b = [0]
Output: [0]
```

**Example 3**

```
Input:  a = [], b = []
Output: []
```

## Constraints

- Each list has between $0$ and $5 \cdot 10^4$ nodes.
- $-10^4 \le \text{node.val} \le 10^4$
- Both lists are sorted in non-decreasing order.
