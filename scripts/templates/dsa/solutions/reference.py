class Solution:
    def sumOfTwoLargest(self, nums: List[int]) -> int:
        first = second = float("-inf")
        for x in nums:
            if x > first:
                first, second = x, first
            elif x > second:
                second = x
        return int(first + second)
