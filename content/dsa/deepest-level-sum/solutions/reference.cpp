class Solution {
public:
    long long deepestLevelSum(TreeNode* root) {
        if (!root) return 0;
        vector<TreeNode*> level{root};
        while (true) {
            vector<TreeNode*> next;
            long long sum = 0;
            for (TreeNode* n : level) {
                sum += n->val;
                if (n->left) next.push_back(n->left);
                if (n->right) next.push_back(n->right);
            }
            if (next.empty()) return sum;
            level.swap(next);
        }
    }
};
