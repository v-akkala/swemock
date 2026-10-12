/**
 * Interview rubrics. Each dimension is scored 1–4. The checklist items are the "hidden rubric" revealed
 * after a round for self-scoring (spec §7.5); the anchors describe each level for AI graders.
 */
export type ChecklistKind = "must" | "strong" | "red";

export interface ChecklistItem {
  id: string;
  kind: ChecklistKind;
  text: string;
}

export interface RubricDimension {
  id: string;
  label: string;
  description: string;
  /** What a 1, 2, 3, and 4 look like. */
  anchors: [string, string, string, string];
  items: ChecklistItem[];
}

export interface Rubric {
  id: string;
  version: string;
  dimensions: RubricDimension[];
}

export const DSA_INTERVIEW_RUBRIC: Rubric = {
  id: "dsa-interview",
  version: "1",
  dimensions: [
    {
      id: "understanding",
      label: "Understanding and clarification",
      description: "Pins down the problem before solving it: inputs, outputs, constraints, edge cases.",
      anchors: [
        "Starts solving without confirming what is asked; misreads the problem.",
        "Asks a few questions, but misses constraints or edge cases that matter.",
        "Clarifies inputs, outputs, and the main constraints; confirms with an example.",
        "Quickly surfaces every constraint and edge case that matters, and states assumptions explicitly.",
      ],
      items: [
        { id: "u-restate", kind: "must", text: "Restated the problem or confirmed it with a small example" },
        { id: "u-constraints", kind: "must", text: "Asked about input size or constraints" },
        { id: "u-edges", kind: "must", text: "Asked about edge cases (empty input, duplicates, negatives, limits)" },
        { id: "u-assumptions", kind: "strong", text: "Stated assumptions out loud before relying on them" },
        { id: "u-none", kind: "red", text: "Started coding without clarifying anything" },
      ],
    },
    {
      id: "algorithm",
      label: "Algorithm quality",
      description: "Finds an approach with the right complexity and explains why it works.",
      anchors: [
        "No working approach, or only a brute force without recognizing its cost.",
        "A working but clearly suboptimal approach.",
        "The optimal approach, reached with some prompting or detours.",
        "The optimal approach, justified, with alternatives and tradeoffs considered.",
      ],
      items: [
        { id: "a-before", kind: "must", text: "Explained the approach before coding" },
        { id: "a-optimal", kind: "must", text: "Reached the optimal time complexity for this problem" },
        { id: "a-brute", kind: "strong", text: "Started from a simple approach and improved it deliberately" },
        { id: "a-tradeoffs", kind: "strong", text: "Compared at least two approaches and their tradeoffs" },
        { id: "a-stuck", kind: "red", text: "Stayed on a brute force without recognizing it was too slow" },
      ],
    },
    {
      id: "correctness",
      label: "Correctness",
      description: "The code works, including on edge cases.",
      anchors: [
        "Code does not run or fails most cases.",
        "Works on the happy path; fails edge cases.",
        "Correct after a fix or two found by testing.",
        "Correct on the first real attempt, including edge cases.",
      ],
      items: [
        { id: "c-trace", kind: "must", text: "Traced the code by hand on an example before submitting" },
        { id: "c-edges", kind: "must", text: "Handled the edge cases identified earlier" },
        { id: "c-guess", kind: "red", text: "Changed code at random until tests passed" },
      ],
    },
    {
      id: "code_quality",
      label: "Code quality",
      description: "Readable, well-structured code a teammate could maintain.",
      anchors: [
        "Hard to follow: unclear names, tangled control flow.",
        "Works but messy: duplication, magic numbers, long functions.",
        "Clean and readable with minor issues.",
        "Idiomatic, well-named, appropriately decomposed.",
      ],
      items: [
        { id: "q-names", kind: "must", text: "Used descriptive names" },
        { id: "q-dup", kind: "must", text: "Avoided duplicated logic" },
        { id: "q-idiom", kind: "strong", text: "Used the language idiomatically (standard library, clear structure)" },
        { id: "q-dead", kind: "red", text: "Left dead code, debug prints, or commented-out attempts" },
      ],
    },
    {
      id: "complexity",
      label: "Complexity analysis",
      description: "States time and space complexity correctly and can justify it.",
      anchors: [
        "No analysis, or a wrong one.",
        "Time complexity only, or correct but unjustified.",
        "Correct time and space complexity with a brief justification.",
        "Correct and well-justified, including amortized or worst-case subtleties.",
      ],
      items: [
        { id: "x-time", kind: "must", text: "Stated the time complexity correctly" },
        { id: "x-space", kind: "must", text: "Stated the space complexity correctly" },
        { id: "x-why", kind: "strong", text: "Explained why (which loops, which data structure operations)" },
        { id: "x-wrong", kind: "red", text: "Claimed a complexity that was wrong" },
      ],
    },
    {
      id: "testing",
      label: "Testing and edge cases",
      description: "Verifies the code deliberately instead of relying on the judge.",
      anchors: [
        "Submitted without testing.",
        "Ran only the provided samples.",
        "Tested samples plus at least one edge case of their own.",
        "Designed targeted tests (edges, large input) and fixed issues before submitting.",
      ],
      items: [
        { id: "t-samples", kind: "must", text: "Ran the sample tests before submitting" },
        { id: "t-own", kind: "must", text: "Tried at least one input of my own (custom input or a hand trace)" },
        { id: "t-large", kind: "strong", text: "Thought about the largest inputs and performance" },
        { id: "t-blind", kind: "red", text: "Submitted without running anything" },
      ],
    },
    {
      id: "communication",
      label: "Communication",
      description: "Thinks out loud, responds to the interviewer, and keeps them in the loop.",
      anchors: [
        "Silent or hard to follow; ignores the interviewer.",
        "Explains when asked, but long silent stretches.",
        "Narrates key decisions and answers questions clearly.",
        "Clear, concise, collaborative throughout; handles hints and follow-ups well.",
      ],
      items: [
        { id: "m-narrate", kind: "must", text: "Narrated my thinking while coding" },
        { id: "m-followups", kind: "must", text: "Answered the interviewer's follow-up questions" },
        { id: "m-concise", kind: "strong", text: "Kept explanations concise and structured" },
        { id: "m-silent", kind: "red", text: "Went silent for long stretches or ignored the interviewer" },
      ],
    },
  ],
};

export const RUBRICS: Record<string, Rubric> = { [DSA_INTERVIEW_RUBRIC.id]: DSA_INTERVIEW_RUBRIC };
