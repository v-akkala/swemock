## Intuition

The cache needs two things at once: find a key in constant time, and know which key is the oldest. A hash map is perfect for lookup but has no order. A linked list keeps order, but finding a key in it takes linear time. Combine them: the map stores, for each key, a pointer to its node in a doubly linked list ordered by recency.

## Approach

- Keep the list ordered from most recently used (front) to least recently used (back).
- `get(key)`: if the key is missing return `-1`. Otherwise detach its node and reinsert it at the front, then return the value.
- `put(key, value)`:
  - existing key: update the value and move the node to the front;
  - new key: if the cache is full, remove the back node and delete its key from the map. Then insert a new node at the front and register it in the map.

Detaching a node from a doubly linked list is $O(1)$ because you hold the node and its neighbors are reachable from it.

## Complexity

All operations take $O(1)$ average time, and space is $O(\text{capacity})$. Language built-ins that implement the same idea exist (an ordered dictionary in Python, `std::list` with `splice` in C++), and are acceptable. A plain list that you scan on each call costs $O(\text{capacity})$ per operation and times out.

## Pitfalls and edge cases

- **Updating an existing key is a use.** It must refresh recency, and it must not trigger an eviction.
- **A successful `get` refreshes recency;** a failed one changes nothing.
- **Capacity 1:** every new key evicts the previous one.
- **Evict before insert,** and remove the evicted key from the map as well as the list.
- **Keys can be 0,** so don't use `0` or a falsy check as "missing".
