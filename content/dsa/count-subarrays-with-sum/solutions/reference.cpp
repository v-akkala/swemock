class Solution {
public:
    long long countSubarrays(vector<int>& nums, long long k) {
        unordered_map<long long, long long> counts;
        counts.reserve(nums.size() * 2 + 2);
        counts[0] = 1;
        long long prefix = 0, total = 0;
        for (int x : nums) {
            prefix += x;
            auto it = counts.find(prefix - k);
            if (it != counts.end()) total += it->second;
            counts[prefix]++;
        }
        return total;
    }
};
