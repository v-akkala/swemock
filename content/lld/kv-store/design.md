# Design notes

The key decision is *where changes live while a transaction is open*. Writing to the real data and logging undo records works, but it makes `commit` of a nested transaction awkward. The cleaner model is **layered overlays**: the store keeps its permanent dictionary, plus a stack with one overlay (dictionary of pending changes) per open transaction.

- `get`: search overlays from the top of the stack to the bottom, then the permanent data. The first hit wins.
- `set`: write to the top overlay (or to the permanent data when no transaction is open).
- `delete`: write a **tombstone** (a private sentinel object) so that a deletion hides the older value and `None` stays an ordinary value.
- `commit`: pop the top overlay and merge it into the layer below; at depth one, apply it to the permanent data (tombstones delete).
- `rollback`: pop and drop the top overlay. Nothing to undo, because nothing was applied.
- Costs: `set`/`get`/`delete` O(depth) in the worst case (or O(1) if each read memoizes), `commit` O(size of the overlay), `rollback` O(1).

**Encapsulation.** The overlay stack and the tombstone are private; the public API is six methods. An invalid state (commit with nothing open) is rejected at the boundary with one error type.

**The requirement change** (`count(value)`) shows why representation matters. Scanning every key is fine at small scale; for O(1), keep a value-to-count index and apply the same overlay logic to the *deltas*. Because the overlays already hold every pending change, the simple version is a scan over the merged view.
