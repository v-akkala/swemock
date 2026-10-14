# Design notes

A token bucket needs only two numbers per key: the tokens left and the time they were last computed. Refill is *lazy*: on each request compute `elapsed * rate`, add it, cap at capacity, then try to spend. This keeps the limiter free of timers and threads and makes it deterministic under an injected clock.

- **State per key:** a tiny `Bucket` (tokens, last_update). It is created on first use, full.
- **`allow`:** refill, compare, spend. A denied request spends nothing, so a client can't dig itself deeper by retrying.
- **Clock regressions:** `max(0, now - last)` so a clock that steps backwards never mints tokens.
- **Validation:** constructor arguments are checked once so an invalid limiter can't exist.
- **Complexity:** O(1) per request, O(keys) memory. A production version also evicts idle buckets (a bucket idle long enough to be full carries no information).

**Alternatives.** A sliding-window *log* stores a timestamp per request: exact, but O(requests) memory. A sliding-window *counter* approximates it from two fixed windows. A token bucket allows bursts up to capacity and then a steady rate, which is usually what API limits want.

**The requirement change** (per-key limits) is absorbed by letting each bucket carry its own capacity and rate, with the constructor arguments becoming the defaults for unknown keys. `set_limit` refills first and then re-caps, so changing a limit never gives free tokens.
