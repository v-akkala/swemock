import { COMPETENCY_IDS, CS_TOPICS, LENS_TAGS } from "@swemock/shared";
import { z } from "zod";
import { difficultySchema } from "../dsa/manifest";

/**
 * YAML reads an unquoted list item like `- Average O(1): hash the key` as a one-entry mapping. Authors
 * shouldn't have to know that, so a one-entry mapping with a text value is turned back into "key: value".
 */
function unmap(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v);
    if (entries.length === 1 && typeof entries[0]![1] === "string") return `${entries[0]![0]}: ${entries[0]![1]}`;
  }
  return v;
}

const line = z.preprocess(unmap, z.string().trim().min(1).max(600));
const prose = z.string().trim().min(1).max(4000);
const common = {
  title: z.string().trim().min(3).max(100),
  source: z.string().trim().min(1).default("authored"),
  reviewed: z.boolean().default(false),
  version: z.number().int().min(1),
};

/** question.yaml for a CS fundamentals question (content/cs/<slug>/question.yaml). */
export const csManifestSchema = z
  .object({
    ...common,
    difficulty: difficultySchema,
    topics: z.array(z.enum(CS_TOPICS)).min(1).max(3),
    format: z.enum(["short", "mcq"]).default("short"),
    /** The question as the interviewer asks it (Markdown). */
    prompt: prose,
    /** MCQ only: exactly one option has `correct: true`. */
    options: z.array(z.object({ text: line, correct: z.boolean().default(false) }).strict()).max(5).default([]),
    /** What a good answer covers. Revealed after the candidate answers. */
    key_points: z.array(line).min(2).max(8),
    /** A model answer in a few sentences (Markdown). */
    model_answer: prose,
    /** One natural follow-up an interviewer might ask. */
    follow_up: line.optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.correct).length;
    if (q.format === "mcq") {
      if (q.options.length < 3) ctx.addIssue({ code: "custom", path: ["options"], message: "an MCQ needs 3–5 options" });
      if (correct !== 1) ctx.addIssue({ code: "custom", path: ["options"], message: `an MCQ needs exactly one correct option (found ${correct})` });
    } else if (q.options.length > 0) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "only MCQs have options (set format: mcq)" });
    }
  });
export type CsManifest = z.infer<typeof csManifestSchema>;

/** question.yaml for a behavioral question (content/behavioral/<slug>/question.yaml). */
export const behavioralManifestSchema = z
  .object({
    ...common,
    competencies: z.array(z.enum(COMPETENCY_IDS)).min(1).max(3),
    /** Optional company lenses (Amazon / Google / Meta style), as lens:tag. */
    lenses: z.array(z.enum(LENS_TAGS)).max(4).default([]),
    prompt: prose,
    /** 3–5 probes, in the order a scripted interviewer should use them. */
    follow_ups: z.array(line).min(3).max(5),
    /** What a strong answer contains: the "must-hit" points graders and the self-checklist use. */
    strong_signals: z.array(line).min(2).max(6),
    red_flags: z.array(line).max(4).default([]),
    /** Coaching notes shown in the debrief (Markdown). */
    tips: prose.optional(),
  })
  .strict();
export type BehavioralManifest = z.infer<typeof behavioralManifestSchema>;
