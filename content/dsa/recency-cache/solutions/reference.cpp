class RecencyCache {
    int capacity;
    list<pair<int, int>> items;  // front = most recently used
    unordered_map<int, list<pair<int, int>>::iterator> where;

public:
    RecencyCache(int capacity) : capacity(capacity) {}

    int get(int key) {
        auto it = where.find(key);
        if (it == where.end()) return -1;
        items.splice(items.begin(), items, it->second);
        return it->second->second;
    }

    void put(int key, int value) {
        auto it = where.find(key);
        if (it != where.end()) {
            it->second->second = value;
            items.splice(items.begin(), items, it->second);
            return;
        }
        if ((int)items.size() == capacity) {
            where.erase(items.back().first);
            items.pop_back();
        }
        items.emplace_front(key, value);
        where[key] = items.begin();
    }
};
