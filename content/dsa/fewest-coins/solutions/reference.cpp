class Solution {
public:
    int fewestCoins(vector<int>& coins, int amount) {
        const int INF = amount + 1;
        vector<int> best(amount + 1, INF);
        best[0] = 0;
        for (int a = 1; a <= amount; a++)
            for (int c : coins)
                if (c <= a && best[a - c] + 1 < best[a]) best[a] = best[a - c] + 1;
        return best[amount] < INF ? best[amount] : -1;
    }
};
