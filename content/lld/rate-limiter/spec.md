# Rate Limiter

Implement a **token bucket** rate limiter that keeps a separate bucket for every key (a user, an IP address, an API key).

## Behavior

- Every key's bucket holds up to `capacity` tokens and starts **full**.
- Tokens refill continuously at `refill_per_second`, never above `capacity`. Do not use background threads or timers: work out the refill from the clock when a request arrives.
- A request for a key costs `cost` tokens (default 1). If the bucket has at least `cost` tokens, spend them and allow the request; otherwise deny it and spend nothing.
- Buckets are created lazily the first time a key is seen.
- The clock is injected so tests control time.

## API

- `RateLimiter(capacity, refill_per_second, clock)`: `capacity` must be positive and `refill_per_second` must not be negative, otherwise raise `ValueError` (C++: `std::invalid_argument`). `clock()` returns the current time in seconds. In Python, `clock` defaults to `time.monotonic`.
- `allow(key, cost=1)` returns `True` (allowed) or `False` (denied). `cost` must be positive, otherwise raise `ValueError`. A request costing more than `capacity` is always denied.
- `tokens(key)` returns how many tokens the key has right now (a float), after refilling. For an unseen key that is `capacity`.

## Notes

If the clock ever goes backwards, treat it as no time passing. Be ready to explain how your design would change for a sliding window instead of a token bucket.
