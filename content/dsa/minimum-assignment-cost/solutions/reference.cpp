class Solution {
public:
    int minAssignmentCost(vector<vector<int>>& cost) {
        int n = cost.size();
        const int INF = INT_MAX / 2;
        vector<int> dp(1 << n, INF);
        dp[0] = 0;
        for (int mask = 0; mask < (1 << n) - 1; mask++) {
            if (dp[mask] >= INF) continue;
            int w = __builtin_popcount(mask);
            for (int t = 0; t < n; t++) {
                if (mask >> t & 1) continue;
                int nxt = mask | (1 << t);
                dp[nxt] = min(dp[nxt], dp[mask] + cost[w][t]);
            }
        }
        return dp[(1 << n) - 1];
    }
};
