Design a cache that holds at most `capacity` key-value pairs and evicts the entry that was **used least recently** when it is full.

Implement the class `RecencyCache`:

- `RecencyCache(capacity)` creates an empty cache with the given capacity.
- `get(key)` returns the value stored for `key`, or `-1` if the key is not present. A successful `get` counts as a use of that key.
- `put(key, value)` stores the value for `key`, replacing an existing value. Storing a key counts as a use of that key. If adding a new key would exceed the capacity, first evict the key whose most recent use is the oldest.

Both operations must run in average $O(1)$ time.

The tests describe a sequence of calls: the first operation is the constructor, and the output lists one result per call (`null` for the constructor and for `put`).

## Examples

**Example 1**

```
Operations: ["RecencyCache", "put", "put", "put", "get", "get", "get"]
Arguments:  [[2], [5, 50], [6, 60], [7, 70], [5], [6], [7]]
Output:     [null, null, null, null, -1, 60, 70]
```

Adding key 7 evicts key 5, the least recently used.

**Example 2**

```
Operations: ["RecencyCache", "put", "put", "put", "put", "get", "get"]
Arguments:  [[2], [5, 50], [6, 60], [5, 55], [7, 70], [6], [5]]
Output:     [null, null, null, null, null, -1, 55]
```

Updating key 5 makes it the most recently used, so adding key 7 evicts key 6.

## Constraints

- $1 \le \text{capacity} \le 10^4$
- $0 \le \text{key} \le 10^6$ and $0 \le \text{value} \le 10^5$
- At most $5 \cdot 10^4$ calls to `get` and `put` in total.
