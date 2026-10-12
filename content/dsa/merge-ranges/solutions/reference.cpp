class Solution {
public:
    vector<vector<int>> mergeRanges(vector<vector<int>>& ranges) {
        vector<vector<int>> sorted = ranges;
        sort(sorted.begin(), sorted.end());
        vector<vector<int>> out;
        for (auto& r : sorted) {
            if (!out.empty() && r[0] <= out.back()[1]) out.back()[1] = max(out.back()[1], r[1]);
            else out.push_back(r);
        }
        return out;
    }
};
