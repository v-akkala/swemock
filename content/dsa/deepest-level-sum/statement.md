Given the root of a binary tree, return the sum of the values of all nodes that are on the **deepest level** of the tree. The root is on level $0$. An empty tree has sum $0$.

The tree is given in level order, with `null` marking a missing child. Node values can be negative.

## Examples

**Example 1**

```
Input:  root = [1, 2, 3, 4, 5, null, 6, 7]
Output: 7
```

The deepest level contains only the node with value $7$.

**Example 2**

```
Input:  root = [3, 9, 20, null, null, 15, 7]
Output: 22
```

The deepest level holds $15$ and $7$.

**Example 3**

```
Input:  root = []
Output: 0
```

## Constraints

- The number of nodes is between $0$ and $5 \cdot 10^4$.
- $-10^4 \le \text{node.val} \le 10^4$
- The tree may be very unbalanced, up to $5 \cdot 10^4$ levels deep.
