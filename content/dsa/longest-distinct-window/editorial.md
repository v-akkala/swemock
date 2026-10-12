## Intuition

If a window has more than `k` distinct characters, extending it to the right can never fix that, so the only way forward is to shrink it from the left. This one-directional behavior means both window ends only ever move forward, which is the signature of a sliding window.

## Approach

Keep a window `[left, right]` and a count of each character inside it.

1. For each `right`, add `s[right]` to the counts.
2. While the number of distinct characters exceeds `k`, remove `s[left]` (deleting its entry when the count reaches zero) and advance `left`.
3. The window is now valid and ends at `right`; update the best length with `right - left + 1`.

## Complexity

Each index enters and leaves the window at most once, so time is $O(n)$. Space is $O(\sigma)$ for an alphabet of size $\sigma$ (here at most 26).

Checking every substring and counting its distinct characters is $O(n^2)$ or worse, which times out for $n = 10^5$.

## Pitfalls and edge cases

- **Zero counts.** A character leaves the window only when its count reaches 0; remove the entry then, or the distinct count will be wrong.
- **`k` larger than the alphabet in `s`.** The answer is `len(s)`.
- **Shrinking with `if` instead of `while`.** One removal may not be enough to restore validity in general.
- **Length off by one.** The length of `[left, right]` is `right - left + 1`.
