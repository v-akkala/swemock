# Tally

Implement a `Tally` that counts how many times each key was added.

## API

- `add(key, n=1)` adds `n` to the key's count. `n` must be positive, otherwise raise `ValueError` (C++: `std::invalid_argument`).
- `get(key)` returns the key's count, or `0` if it was never added.
- `top(k)` returns the `k` keys with the highest counts as a list of `(key, count)`, highest first; ties are broken by key in ascending order. `k <= 0` returns an empty list.

## Notes

State what you assume in the chat or in comments. Aim for clean, readable code over cleverness.
