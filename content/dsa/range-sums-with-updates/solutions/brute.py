class LiveSums:

    def __init__(self, nums: List[int]):
        self.nums = list(nums)

    def update(self, index: int, value: int) -> None:
        self.nums[index] = value

    def rangeSum(self, left: int, right: int) -> int:
        return sum(self.nums[left:right + 1])
