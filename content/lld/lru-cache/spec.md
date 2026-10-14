# LRU Cache

Implement a fixed-capacity cache that evicts the **least recently used** entry when it is full.

## API

- `LRUCache(capacity)` creates an empty cache. `capacity` must be at least 1, otherwise raise `ValueError` (C++: `std::invalid_argument`).
- `get(key)` returns the value stored for `key` and marks the entry as most recently used. If the key is absent, return `None` (C++: return `std::optional<int>` empty).
- `put(key, value)` stores or replaces the value for `key` and marks it most recently used. If the cache is full and the key is new, first evict the least recently used entry.
- `size()` returns the number of entries currently stored.
- `keys()` returns the keys from most to least recently used (a list; C++: `std::vector<int>`). It does **not** change the order.

Keys and values are integers in C++ and any hashable key and any value in Python.

## Expectations

- `get` and `put` run in O(1) on average.
- Replacing the value of an existing key never evicts anything.
- A `get` of a missing key changes nothing.

## Notes

Say what you assume out loud in the chat or in comments, and keep the code readable: a teammate should be able to maintain it.
