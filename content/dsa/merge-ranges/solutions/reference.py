class Solution:
    def mergeRanges(self, ranges: List[List[int]]) -> List[List[int]]:
        out = []
        for start, end in sorted(ranges):
            if out and start <= out[-1][1]:
                out[-1][1] = max(out[-1][1], end)
            else:
                out.append([start, end])
        return out
