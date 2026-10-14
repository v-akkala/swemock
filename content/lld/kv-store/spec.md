# Key-Value Store with Transactions

Implement an in-memory key-value store that supports **nested transactions**.

## API

- `set(key, value)` stores a value for the key (replacing any earlier one).
- `get(key)` returns the current value, or `None` (C++: empty `std::optional`) if the key is absent.
- `delete(key)` removes the key and returns `True` if it existed, `False` otherwise. (C++: `remove`.)
- `begin()` opens a transaction. Transactions nest.
- `commit()` closes the **innermost** open transaction and keeps its changes: they become part of the enclosing transaction, or of the store itself if it was the outermost one. Raise `RuntimeError` (C++: `std::logic_error`) if no transaction is open.
- `rollback()` closes the innermost open transaction and discards its changes. Same error if none is open.
- `depth()` returns how many transactions are open.

Keys are strings. Values are any value in Python (including `None`), and strings in C++.

## Behavior

- Reads inside a transaction see that transaction's own changes and those of the enclosing ones.
- Changes made in a transaction stay invisible to the store's permanent state until the outermost transaction commits. If an enclosing transaction is later rolled back, the changes of an inner, already committed transaction are discarded too.
- Operations outside any transaction apply immediately.

## Notes

Think about what each operation costs and what must be stored per transaction. Be ready to explain how deletions are represented.
