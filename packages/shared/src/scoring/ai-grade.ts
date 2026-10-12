import { z } from "zod";
import { recommendationSchema } from "./formulas";
import type { Rubric } from "./rubrics";

/**
 * What an AI grader returns, live or pasted back from a grading packet (same schema for both).
 * The reply ends with one fenced ```json block holding this object.
 */
export const aiGradeSchema = z.object({
  dimensions: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().int().min(1).max(4),
        evidence: z.array(z.string().min(1)).min(1).max(6),
      }),
    )
    .min(1),
  recommendation: recommendationSchema,
  strengths: z.array(z.string().min(1)).min(1).max(3),
  improvements: z.array(z.string().min(1)).min(1).max(3),
  strong_candidate: z.string().min(1),
});
export type AiGrade = z.infer<typeof aiGradeSchema>;

/** Checks the grade covers exactly the rubric's dimensions. Returns an error message or null. */
export function checkGradeAgainstRubric(grade: AiGrade, rubric: Rubric): string | null {
  const want = rubric.dimensions.map((d) => d.id).sort();
  const got = grade.dimensions.map((d) => d.id).sort();
  const missing = want.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.includes(id));
  if (missing.length) return `missing dimension(s): ${missing.join(", ")}`;
  if (extra.length) return `unknown dimension(s): ${extra.join(", ")}`;
  if (new Set(got).size !== got.length) return "a dimension appears twice";
  return null;
}

/** An example reply body, shown in packets so any chatbot knows the exact shape. */
export function exampleGrade(rubric: Rubric): AiGrade {
  return {
    dimensions: rubric.dimensions.map((d) => ({ id: d.id, score: 3, evidence: ["[12:40] quote or code reference"] })),
    recommendation: "lean_hire",
    strengths: ["…", "…", "…"],
    improvements: ["…", "…", "…"],
    strong_candidate: "What a strong candidate would have done differently, in a short paragraph.",
  };
}
