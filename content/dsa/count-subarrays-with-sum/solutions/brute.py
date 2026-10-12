class Solution:
    def countSubarrays(self, nums: List[int], k: int) -> int:
        n = len(nums)
        total = 0
        for i in range(n):
            running = 0
            for j in range(i, n):
                running += nums[j]
                if running == k:
                    total += 1
        return total
