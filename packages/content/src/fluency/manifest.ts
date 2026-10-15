import { FINDING_CATEGORIES, LANGUAGES, SEVERITIES } from "@swemock/shared";
import { z } from "zod";
import { difficultySchema } from "../dsa/manifest";

export const FLUENCY_TAGS = [
  "caching",
  "scheduling",
  "parsing",
  "http",
  "auth",
  "etl",
  "inventory",
  "interpreter",
  "pagination",
  "booking",
  "cli",
  "concurrency",
  "security",
  "testing",
  "data-structures",
  "refactoring",
] as const;

const text = z.string().trim().min(1).max(4000);
const relPath = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\w.-]+(?:\/[\w.-]+)*$/, "use a plain relative path");

/** An exact text replacement: the fix for a planted issue (and how validation proves the issue is real). */
export const fixSchema = z.object({ file: relPath, old: z.string().min(1), new: z.string() }).strict();
export type Fix = z.infer<typeof fixSchema>;

const linesSchema = z
  .tuple([z.number().int().min(1), z.number().int().min(1)])
  .refine(([a, b]) => b >= a, "end line must not be before the start line");

export const issueSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    file: relPath,
    lines: linesSchema,
    category: z.enum(FINDING_CATEGORIES),
    severity: z.enum(SEVERITIES),
    title: z.string().trim().min(3).max(140),
    explanation: text,
    /** Applying it removes the issue; the item's checks use it. */
    fix: fixSchema.optional(),
  })
  .strict();
export type IssueSpec = z.infer<typeof issueSchema>;

export const acceptableSchema = z
  .object({ file: relPath, lines: linesSchema, category: z.enum(FINDING_CATEGORIES).optional(), note: text })
  .strict();

const commandSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().trim().min(1).max(40),
    cmd: z.string().trim().min(1).max(500),
    /** JUnit XML written by the command, parsed into per-test results. */
    results: relPath.optional(),
  })
  .strict();

const base = {
  title: z.string().trim().min(3).max(80),
  difficulty: difficultySchema,
  tags: z.array(z.enum(FLUENCY_TAGS)).min(1).max(4),
  source: z.string().trim().min(1).default("authored"),
  reviewed: z.boolean().default(false),
  version: z.number().int().min(1),
  language: z.enum(LANGUAGES),
  minutes: z.number().int().min(20).max(90),
  /** What the run panel offers besides the default test command (Python: pytest over tests/). */
  commands: z.array(commandSchema).max(4).default([]),
};

const decisionSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), title: z.string().trim().min(3).max(140), for: text, against: text }).strict();

/** item.yaml for a code comprehension codebase. */
export const comprehensionSchema = z
  .object({
    ...base,
    /** What the candidate is told about the system before reading it. */
    brief: text,
    bugs: z.array(issueSchema).min(4).max(8),
    decisions: z.array(decisionSchema).min(2).max(4),
    improvements: z.array(text).min(3).max(5),
    acceptable: z.array(acceptableSchema).default([]),
    /** Authored design questions for the scripted interviewer. */
    questions: z.array(text).min(3).max(8),
  })
  .strict();
export type ComprehensionManifest = z.infer<typeof comprehensionSchema>;

export const DECISIONS = ["approve", "request_changes", "reject"] as const;

/** item.yaml for an AI-generated pull request to review. */
export const reviewSchema = z
  .object({
    ...base,
    pr: z.object({ title: z.string().trim().min(3).max(140), description: text }).strict(),
    /** The right call. A correct PR is "approve" with at most nits; over-flagging is penalized. */
    decision: z.enum(DECISIONS),
    issues: z.array(issueSchema).max(8).default([]),
    acceptable: z.array(acceptableSchema).default([]),
    questions: z.array(text).min(2).max(6),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.decision !== "approve" && m.issues.length === 0) ctx.addIssue({ code: "custom", path: ["issues"], message: "a PR that shouldn't be approved needs seeded issues" });
  });
export type ReviewManifest = z.infer<typeof reviewSchema>;

/** item.yaml for a feature-extension repo. The ticket is ticket.md; the conventions CONVENTIONS.md in the repo. */
export const extensionSchema = z
  .object({
    ...base,
    questions: z.array(text).min(2).max(6),
  })
  .strict();
export type ExtensionManifest = z.infer<typeof extensionSchema>;
