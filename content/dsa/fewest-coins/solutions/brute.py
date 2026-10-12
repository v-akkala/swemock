class Solution:
    def fewestCoins(self, coins: List[int], amount: int) -> int:
        INF = float("inf")

        def go(remaining):
            if remaining == 0:
                return 0
            best = INF
            for c in coins:
                if c <= remaining:
                    best = min(best, go(remaining - c) + 1)
            return best

        result = go(amount)
        return -1 if result == INF else result
