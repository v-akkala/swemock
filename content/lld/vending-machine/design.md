# Design notes

The machine's behavior depends on *what has happened so far*: whether money is in. That is a state-machine flavor, but with two states (`idle`, `has_money`) and the only differences being the answer to `state()` and what `cancel` returns, a full State pattern (a class per state) would be more machinery than behavior. The honest design is a small class with explicit invariants; if more states arrive (out of service, maintenance, card session), that is the point to extract state objects.

- **Provided code is the vocabulary.** The coins, products, stock, and errors live in `catalog.py`. The machine uses `Inventory.product`, `Inventory.remove_one`, and raises the provided errors. Re-deriving prices or catching string errors would break "consistency with file 1".
- **Money as a multiset.** Keep a count per coin; the balance is `sum(coin * n)`. `cancel` returns exactly the inserted coins, and the balance can't drift from the coins because it is never stored separately.
- **`select` validates, then commits.** Look up the product (unknown), check stock (sold out), check the balance (insufficient), and only then remove the item and reset the coins. A failed `select` has no side effects, which is easy to test and easy to reason about.
- **Change-making** with a greedy pass from the largest coin gives the fewest coins for this coin system (100, 25, 10, 5), whose structure makes greedy optimal. Say so out loud; it is not true for every coin system.

**The requirement change** (a limited coin float) turns change-making into a feasibility question with a finite supply, where greedy may fail even if change is possible. The refactor to isolate "make change from this supply" in one function pays off here.
