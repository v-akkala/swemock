import { describe, expect, it } from "vitest";
import { buildLeakFilter } from "./leak-filter";

const reference = `class Solution:
    def countPairsWithSum(self, nums: List[int], target: int) -> int:
        seen = {}
        total = 0
        for x in nums:
            total += seen.get(target - x, 0)
            seen[x] = seen.get(x, 0) + 1
        return total`;
const editorial =
  "Walk left to right. When you reach x, every earlier occurrence of target minus x forms a valid pair with it, and each pair is counted exactly once this way.";

const filter = buildLeakFilter({ code: [reference], prose: [editorial] }, { blockCodeBlocks: true });

describe("leak filter", () => {
  it("lets normal interviewer talk through", () => {
    expect(filter.check("Good. What's the time complexity of that, and which edge cases worry you?").leaked).toBe(false);
    expect(filter.check("Think about what you've already seen while scanning.").leaked).toBe(false);
    expect(filter.check("Try `nums = []` as an input.").leaked).toBe(false);
  });

  it("catches the reference solution, even without a code fence or with different spacing", () => {
    expect(filter.check("You could write: total += seen.get(target - x, 0) then seen[x] = seen.get(x, 0) + 1").leaked).toBe(true);
    expect(filter.check("for x in nums:\n  total+=seen.get(target-x,0)\n  seen[x]=seen.get(x,0)+1").reason).toBe("reference solution");
  });

  it("catches editorial prose and long code blocks", () => {
    expect(filter.check(`Here's the idea: every earlier occurrence of target minus x forms a valid pair with it.`).reason).toBe("editorial");
    expect(filter.check("```python\na = 1\nb = 2\nc = 3\nd = 4\n```").reason).toBe("code block");
    expect(filter.check("```python\nx = 1\n```").leaked).toBe(false);
  });

  it("can allow code blocks outside interview mode", () => {
    const lenient = buildLeakFilter({ code: [reference], prose: [] }, { blockCodeBlocks: false });
    expect(lenient.check("```python\na = 1\nb = 2\nc = 3\nd = 4\n```").leaked).toBe(false);
  });
});
