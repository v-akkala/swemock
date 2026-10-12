class Solution:
    def minCapacity(self, weights: List[int], days: int) -> int:
        cap = max(weights)
        while True:
            used, load = 1, 0
            for w in weights:
                if load + w > cap:
                    used += 1
                    load = 0
                load += w
            if used <= days:
                return cap
            cap += 1
