class Solution:
    def mergeRanges(self, ranges: List[List[int]]) -> List[List[int]]:
        n = len(ranges)
        parent = list(range(n))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for i in range(n):
            for j in range(i + 1, n):
                a, b = ranges[i], ranges[j]
                if a[0] <= b[1] and b[0] <= a[1]:
                    parent[find(i)] = find(j)
        merged = {}
        for i, (s, e) in enumerate(ranges):
            root = find(i)
            if root in merged:
                merged[root] = [min(merged[root][0], s), max(merged[root][1], e)]
            else:
                merged[root] = [s, e]
        return sorted(merged.values())
