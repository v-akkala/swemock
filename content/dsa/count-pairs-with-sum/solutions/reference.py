class Solution:
    def countPairsWithSum(self, nums: List[int], target: int) -> int:
        seen = {}
        total = 0
        for x in nums:
            total += seen.get(target - x, 0)
            seen[x] = seen.get(x, 0) + 1
        return total
