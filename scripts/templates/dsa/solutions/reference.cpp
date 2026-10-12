class Solution {
public:
    long long sumOfTwoLargest(vector<int>& nums) {
        long long first = LLONG_MIN, second = LLONG_MIN;
        for (int x : nums) {
            if (x > first) { second = first; first = x; }
            else if (x > second) second = x;
        }
        return first + second;
    }
};
