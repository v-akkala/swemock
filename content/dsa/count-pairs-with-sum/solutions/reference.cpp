class Solution {
public:
    long long countPairsWithSum(vector<int>& nums, long long target) {
        unordered_map<long long, long long> seen;
        seen.reserve(nums.size() * 2);
        long long total = 0;
        for (int x : nums) {
            auto it = seen.find(target - x);
            if (it != seen.end()) total += it->second;
            seen[x]++;
        }
        return total;
    }
};
