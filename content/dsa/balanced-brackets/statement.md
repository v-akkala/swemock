A string contains the bracket characters `(`, `)`, `[`, `]`, `{`, `}` mixed with lowercase letters and digits. Letters and digits carry no meaning; ignore them.

The brackets are **balanced** when every opening bracket is closed by a bracket of the same kind, and brackets are closed in the reverse order they were opened. Concretely, deleting the letters and digits must leave a string that can be reduced to the empty string by repeatedly removing an adjacent `()`, `[]` or `{}` pair.

Return `true` if the brackets in `s` are balanced and `false` otherwise. A string with no brackets is balanced.

## Examples

**Example 1**

```
Input:  s = "{[a]b}(c)"
Output: true
```

**Example 2**

```
Input:  s = "([)]"
Output: false
```

The `)` arrives while the most recent open bracket is `[`.

**Example 3**

```
Input:  s = "((x)"
Output: false
```

One `(` is never closed.

## Constraints

- $0 \le \text{s.length} \le 2 \cdot 10^5$
- `s` contains only `()[]{}`, lowercase letters, and digits.
