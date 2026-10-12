class LiveSums:

    def __init__(self, nums: List[int]):
        self.n = len(nums)
        self.nums = list(nums)
        self.tree = [0] * (self.n + 1)
        for i, x in enumerate(nums):
            self._add(i + 1, x)

    def _add(self, i, delta):
        while i <= self.n:
            self.tree[i] += delta
            i += i & -i

    def _prefix(self, i):
        total = 0
        while i > 0:
            total += self.tree[i]
            i -= i & -i
        return total

    def update(self, index: int, value: int) -> None:
        self._add(index + 1, value - self.nums[index])
        self.nums[index] = value

    def rangeSum(self, left: int, right: int) -> int:
        return self._prefix(right + 1) - self._prefix(left)
