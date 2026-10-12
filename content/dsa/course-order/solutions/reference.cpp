class Solution {
public:
    vector<int> courseOrder(int n, vector<vector<int>>& prerequisites) {
        vector<vector<int>> dependents(n);
        vector<int> indegree(n, 0);
        for (auto& p : prerequisites) {
            dependents[p[1]].push_back(p[0]);
            indegree[p[0]]++;
        }
        // Take the largest available course first, so this order differs from the Python reference.
        priority_queue<int> ready;
        for (int c = 0; c < n; c++) if (indegree[c] == 0) ready.push(c);
        vector<int> order;
        while (!ready.empty()) {
            int c = ready.top();
            ready.pop();
            order.push_back(c);
            for (int d : dependents[c]) if (--indegree[d] == 0) ready.push(d);
        }
        return (int)order.size() == n ? order : vector<int>();
    }
};
