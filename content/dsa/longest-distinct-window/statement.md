Given a string `s` and an integer `k`, return the length of the longest substring of `s` that contains **at most** `k` different characters.

A substring is a contiguous run of characters. If `k` is at least the number of different characters in `s`, the whole string qualifies.

## Examples

**Example 1**

```
Input:  s = "eceba", k = 2
Output: 3
```

The substring `"ece"` has two different characters, and no longer substring does.

**Example 2**

```
Input:  s = "aaaa", k = 1
Output: 4
```

**Example 3**

```
Input:  s = "abcabc", k = 1
Output: 1
```

## Constraints

- $1 \le \text{s.length} \le 10^5$
- `s` consists of lowercase English letters.
- $1 \le k \le 26$
