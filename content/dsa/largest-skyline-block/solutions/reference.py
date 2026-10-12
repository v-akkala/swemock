class Solution:
    def largestBlock(self, heights: List[int]) -> int:
        stack = []
        best = 0
        n = len(heights)
        for i in range(n + 1):
            current = heights[i] if i < n else 0
            while stack and heights[stack[-1]] >= current:
                h = heights[stack.pop()]
                left = stack[-1] + 1 if stack else 0
                best = max(best, h * (i - left))
            stack.append(i)
        return best
