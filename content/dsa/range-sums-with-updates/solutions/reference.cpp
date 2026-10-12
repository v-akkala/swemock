class LiveSums {
    int n;
    vector<int> nums;
    vector<long long> tree;

    void add(int i, long long delta) {
        for (; i <= n; i += i & -i) tree[i] += delta;
    }
    long long prefix(int i) const {
        long long total = 0;
        for (; i > 0; i -= i & -i) total += tree[i];
        return total;
    }

public:
    LiveSums(vector<int>& values) : n(values.size()), nums(values), tree(values.size() + 1, 0) {
        for (int i = 0; i < n; i++) add(i + 1, nums[i]);
    }

    void update(int index, int value) {
        add(index + 1, (long long)value - nums[index]);
        nums[index] = value;
    }

    long long rangeSum(int left, int right) {
        return prefix(right + 1) - prefix(left);
    }
};
