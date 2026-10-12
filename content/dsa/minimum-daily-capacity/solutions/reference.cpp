class Solution {
public:
    int minCapacity(vector<int>& weights, int days) {
        long long lo = *max_element(weights.begin(), weights.end());
        long long hi = accumulate(weights.begin(), weights.end(), 0LL);
        auto feasible = [&](long long cap) {
            int used = 1;
            long long load = 0;
            for (int w : weights) {
                if (load + w > cap) { used++; load = 0; }
                load += w;
            }
            return used <= days;
        };
        while (lo < hi) {
            long long mid = (lo + hi) / 2;
            if (feasible(mid)) hi = mid; else lo = mid + 1;
        }
        return (int)lo;
    }
};
