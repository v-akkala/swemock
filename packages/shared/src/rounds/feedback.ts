import { z } from "zod";

/**
 * Structured feedback an AI (connected, or pasted back from a packet) returns for the two "rewrite" features:
 * resume bullets (recruiter screen) and stronger versions of behavioral answers. The same schemas validate
 * both paths. "Never fabricate" (spec §8.5) is enforced mechanically for numbers: see `unsupportedNumbers`.
 */
export const resumeFeedbackSchema = z.object({
  bullets: z
    .array(
      z.object({
        /** The resume bullet, as written. */
        original: z.string().min(1).max(600),
        /** The interviewer pressed on it. */
        drew_followup: z.boolean(),
        could_back_up: z.enum(["yes", "partly", "no"]),
        problem: z.string().min(1).max(500),
        rewrite: z.string().min(1).max(500),
        /** Facts the candidate must supply before the rewrite is true (never invented). */
        needs_from_candidate: z.array(z.string().min(1).max(200)).max(4),
      }),
    )
    .min(1)
    .max(10),
  summary: z.string().min(1).max(1500),
});
export type ResumeFeedback = z.infer<typeof resumeFeedbackSchema>;

export const rewriteSchema = z.object({
  answers: z
    .array(
      z.object({
        question: z.string().min(1).max(600),
        /** The answer rewritten using only facts the candidate gave. */
        stronger_version: z.string().min(1).max(3000),
        /** What the candidate should add (numbers, their own part, the result…). */
        missing_facts: z.array(z.string().min(1).max(300)).max(6),
      }),
    )
    .min(1)
    .max(10),
});
export type RewriteResult = z.infer<typeof rewriteSchema>;

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const norm = (n: string) => n.replace(/,/g, "").replace(/\.0+$/, "");

/** Numbers in `text` that appear in none of `sources`. A rewrite that invents a figure fails this. */
export function unsupportedNumbers(text: string, sources: string[]): string[] {
  const known = new Set(sources.flatMap((s) => (s.match(NUMBER) ?? []).map(norm)));
  return [...new Set((text.match(NUMBER) ?? []).map(norm))].filter((n) => !known.has(n));
}

export const exampleResumeFeedback: ResumeFeedback = {
  bullets: [
    {
      original: "Improved API latency by 40%",
      drew_followup: true,
      could_back_up: "partly",
      problem: "Why the interviewer pressed on it (no baseline, no method)",
      rewrite: "A rewrite that uses only facts from the resume or the conversation",
      needs_from_candidate: ["What the latency was before and after, and how it was measured"],
    },
  ],
  summary: "Two or three sentences on the resume overall.",
};

export const exampleRewrite: RewriteResult = {
  answers: [
    {
      question: "The interviewer's question, shortened",
      stronger_version: "The candidate's answer, rewritten in first person using only the facts they gave.",
      missing_facts: ["A fact the answer needs that the candidate did not provide"],
    },
  ],
};
