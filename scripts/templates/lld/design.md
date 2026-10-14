# Design notes

A `Tally` is a thin wrapper around a map from key to count. Keeping the map private lets the class guarantee its
invariant (counts are positive) and lets `top` be implemented without exposing the representation.

- `add`: O(1) average. Validate `n` first so a failed call changes nothing.
- `get`: O(1) average.
- `top(k)`: O(m log m) for m distinct keys; a heap of size k gives O(m log k) when k is small.

Extensibility: the requirement change (removing counts) only touches `remove`, because the invariant lives in one place.
