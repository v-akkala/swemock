import { LANGUAGES } from "@swemock/shared";
import { z } from "zod";
import { difficultySchema } from "../dsa/manifest";

/** Closed vocabulary so typos don't create stray tags. */
export const LLD_TAGS = [
  "state-pattern",
  "strategy",
  "observer",
  "caching",
  "scheduling",
  "concurrency",
  "transactions",
  "rate-limiting",
  "booking",
  "messaging",
  "data-structures",
  "simulation",
  "finance",
  "extensibility",
] as const;

const text = z.string().trim().min(1).max(4000);
const relPath = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w.-]+(?:\/[\w.-]+)*$/, "use a plain relative path");

export const lldFileSchema = z
  .object({
    path: relPath,
    /** provided: part of the given code (editable, edits tracked). solution: what the candidate writes. */
    role: z.enum(["provided", "solution"]),
  })
  .strict();

const languageSchema = z
  .object({
    /** Files shown in the editor, in tab order. Their starting content is `<lang>/starter/<path>`. */
    files: z.array(lldFileSchema).min(1).max(4),
  })
  .strict();

/** problem.yaml for an LLD problem (content/lld/<slug>/problem.yaml). */
export const lldManifestSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    difficulty: difficultySchema,
    tags: z.array(z.enum(LLD_TAGS)).min(1).max(4),
    source: z.string().trim().min(1).default("authored"),
    reviewed: z.boolean().default(false),
    version: z.number().int().min(1),
    /** system: complete the system around a provided file (A). class: implement one class from a skeleton (B). */
    format: z.enum(["system", "class"]),
    /** Interview length; the requirement change arrives at about 60% of it. */
    minutes: z.number().int().min(20).max(90).default(45),
    languages: z.object(Object.fromEntries(LANGUAGES.map((l) => [l, languageSchema.optional()])) as Record<(typeof LANGUAGES)[number], z.ZodOptional<typeof languageSchema>>).strict(),
    /** Hint levels 1–4. Level 5 is the design notes and reference. */
    hints: z.tuple([text, text, text, text]),
    followups: z.array(text).min(1).max(8),
  })
  .strict()
  .superRefine((m, ctx) => {
    const langs = Object.entries(m.languages).filter(([, v]) => v);
    if (langs.length === 0) ctx.addIssue({ code: "custom", path: ["languages"], message: "at least one language is required" });
    for (const [lang, v] of langs) {
      const files = v!.files;
      if (!files.some((f) => f.role === "solution")) ctx.addIssue({ code: "custom", path: ["languages", lang], message: "needs a solution file" });
      if (m.format === "system" && !files.some((f) => f.role === "provided")) {
        ctx.addIssue({ code: "custom", path: ["languages", lang], message: "a 'system' problem needs a provided file (file 1)" });
      }
      if (m.format === "class" && files.length !== 1) ctx.addIssue({ code: "custom", path: ["languages", lang], message: "a 'class' problem has exactly one file" });
      if (new Set(files.map((f) => f.path)).size !== files.length) ctx.addIssue({ code: "custom", path: ["languages", lang], message: "duplicate file path" });
    }
  });
export type LldManifest = z.infer<typeof lldManifestSchema>;
