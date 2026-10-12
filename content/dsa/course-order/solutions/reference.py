from collections import deque


class Solution:
    def courseOrder(self, n: int, prerequisites: List[List[int]]) -> List[int]:
        dependents = [[] for _ in range(n)]
        indegree = [0] * n
        for a, b in prerequisites:
            dependents[b].append(a)
            indegree[a] += 1
        queue = deque(c for c in range(n) if indegree[c] == 0)
        order = []
        while queue:
            c = queue.popleft()
            order.append(c)
            for d in dependents[c]:
                indegree[d] -= 1
                if indegree[d] == 0:
                    queue.append(d)
        return order if len(order) == n else []
