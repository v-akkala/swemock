from itertools import permutations


class Solution:
    def minAssignmentCost(self, cost: List[List[int]]) -> int:
        n = len(cost)
        return min(sum(cost[w][t] for w, t in enumerate(perm)) for perm in permutations(range(n)))
