class Solution:
    def minAssignmentCost(self, cost: List[List[int]]) -> int:
        n = len(cost)
        INF = float("inf")
        dp = [INF] * (1 << n)
        dp[0] = 0
        for mask in range(1 << n):
            if dp[mask] == INF:
                continue
            w = bin(mask).count("1")
            if w == n:
                continue
            row = cost[w]
            base = dp[mask]
            for t in range(n):
                if not mask >> t & 1:
                    nxt = mask | (1 << t)
                    if base + row[t] < dp[nxt]:
                        dp[nxt] = base + row[t]
        return int(dp[(1 << n) - 1])
