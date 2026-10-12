import "server-only";
import type { DsaTest, Signature } from "@swemock/shared";

/**
 * A built-in problem for the judge playground (Settings → Judge playground), used to check the
 * sandbox end to end before any content exists. Real problems live in /content from M2 on.
 */
export const SAMPLE_PROBLEM: {
  title: string;
  statement: string;
  signature: Signature;
  tests: DsaTest[];
} = {
  title: "Running maximum",
  statement:
    "Given an integer array `nums`, return an array where element `i` is the largest value among `nums[0..i]`.",
  signature: { kind: "function", name: "runningMax", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
  tests: [
    { id: "1", input: { nums: [3, 1, 4, 1, 5] }, expected: [3, 3, 4, 4, 5] },
    { id: "2", input: { nums: [-2, -5, -1] }, expected: [-2, -2, -1] },
    { id: "3", input: { nums: [7] }, expected: [7] },
    { id: "4", input: { nums: [] }, expected: [] },
  ],
};
