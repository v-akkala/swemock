# Design notes

The two operations that must be O(1) pull in different directions: finding an entry wants a hash map, and keeping an order that changes on every access wants a linked list. Combine them: a dictionary from key to node, and a doubly linked list of nodes ordered from most to least recently used.

- `get`: look the node up, move it to the front, return its value. O(1).
- `put`: if the key exists, update the value and move the node to the front. Otherwise, if the cache is full, remove the node at the back (and its dictionary entry) first, then insert a new node at the front. O(1).
- Sentinel head and tail nodes remove every "is the list empty?" special case.

**Encapsulation.** The node type is an implementation detail; callers see only keys and values. The capacity check lives in the constructor so an invalid cache can never exist.

**Over-engineering to avoid.** A generic `EvictionPolicy` interface is tempting, but with one policy it is a layer with a single implementation. Introduce it when a second policy (LFU, TTL) actually arrives.

**The requirement change** (expiry) fits cleanly: store an expiry time per node and treat an expired node as absent in `get` and `keys`, and drop it lazily. The clock is a constructor argument so tests control time.

In Python, `OrderedDict` is an acceptable shortcut once you can explain what it does for you.
