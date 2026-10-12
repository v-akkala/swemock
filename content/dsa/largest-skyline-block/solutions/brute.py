class Solution:
    def largestBlock(self, heights: List[int]) -> int:
        n = len(heights)
        best = 0
        for i in range(n):
            lowest = heights[i]
            for j in range(i, n):
                lowest = min(lowest, heights[j])
                best = max(best, lowest * (j - i + 1))
        return best
