class Solution:
    def countSubarrays(self, nums: List[int], k: int) -> int:
        counts = {0: 1}
        prefix = total = 0
        for x in nums:
            prefix += x
            total += counts.get(prefix - k, 0)
            counts[prefix] = counts.get(prefix, 0) + 1
        return total
