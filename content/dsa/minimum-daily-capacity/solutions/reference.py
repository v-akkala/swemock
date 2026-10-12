class Solution:
    def minCapacity(self, weights: List[int], days: int) -> int:
        def feasible(cap):
            used, load = 1, 0
            for w in weights:
                if load + w > cap:
                    used += 1
                    load = 0
                load += w
            return used <= days

        lo, hi = max(weights), sum(weights)
        while lo < hi:
            mid = (lo + hi) // 2
            if feasible(mid):
                hi = mid
            else:
                lo = mid + 1
        return lo
