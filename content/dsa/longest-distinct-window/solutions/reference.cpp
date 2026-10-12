class Solution {
public:
    int longestWindow(string s, int k) {
        int counts[256] = {0};
        int distinct = 0, left = 0, best = 0;
        for (int right = 0; right < (int)s.size(); right++) {
            if (counts[(unsigned char)s[right]]++ == 0) distinct++;
            while (distinct > k) {
                if (--counts[(unsigned char)s[left]] == 0) distinct--;
                left++;
            }
            best = max(best, right - left + 1);
        }
        return best;
    }
};
