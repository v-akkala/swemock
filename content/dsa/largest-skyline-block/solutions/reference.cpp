class Solution {
public:
    long long largestBlock(vector<int>& heights) {
        vector<int> stack;
        long long best = 0;
        int n = heights.size();
        for (int i = 0; i <= n; i++) {
            int current = i < n ? heights[i] : 0;
            while (!stack.empty() && heights[stack.back()] >= current) {
                long long h = heights[stack.back()];
                stack.pop_back();
                int left = stack.empty() ? 0 : stack.back() + 1;
                best = max(best, h * (i - left));
            }
            stack.push_back(i);
        }
        return best;
    }
};
