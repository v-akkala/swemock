import { checkerSchema, signatureSchema, LIMITS } from "@swemock/shared";
import { z } from "zod";

/** Closed vocabulary so typos don't create stray tags. Adding a topic is a one-line change. */
export const DSA_TAGS = [
  "arrays-hashing",
  "two-pointers",
  "sliding-window",
  "prefix-sums",
  "stack",
  "binary-search",
  "linked-list",
  "trees",
  "tries",
  "heaps",
  "intervals",
  "greedy",
  "backtracking",
  "graphs",
  "topological-sort",
  "union-find",
  "shortest-path",
  "dp",
  "bitmask",
  "bit-manipulation",
  "math",
  "strings",
  "design",
  "segment-tree",
] as const;
export type DsaTag = (typeof DSA_TAGS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const difficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof difficultySchema>;

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Checker as written in problem.yaml: custom checkers reference a file instead of embedding source. */
const manifestCheckerSchema = z.union([
  z.object({ type: z.literal("custom"), file: z.string().regex(/^[\w.-]+\.py$/) }),
  checkerSchema.refine((c) => c.type !== "custom"),
]);

const text = z.string().trim().min(1).max(4000);

/** problem.yaml. Keys are snake_case in the file (matches the spec's `tle_guard`). */
export const dsaManifestSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    difficulty: difficultySchema,
    tags: z.array(z.enum(DSA_TAGS)).min(1).max(5),
    companies: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    source: z.string().trim().min(1).default("authored"),
    reviewed: z.boolean().default(false),
    version: z.number().int().min(1),
    signature: signatureSchema,
    checker: manifestCheckerSchema.default({ type: "exact" }),
    limits: z
      .object({
        time_ms: z.number().int().min(100).max(LIMITS.maxTimeLimitMs).default(LIMITS.defaultTimeLimitMs),
        memory_mb: z.number().int().min(32).max(LIMITS.maxMemoryMb).default(LIMITS.defaultMemoryMb),
      })
      .default({ time_ms: LIMITS.defaultTimeLimitMs, memory_mb: LIMITS.defaultMemoryMb }),
    /** The brute-force solution must time out on the large tests (checked by content:validate). */
    tle_guard: z.boolean().default(false),
    /** Hint levels 1–4. Level 5 is the editorial. */
    hints: z.tuple([text, text, text, text]),
    /** Interviewer follow-ups, used by the scripted interviewer (M3). */
    followups: z.array(text).min(1).max(8),
  })
  .strict();
export type DsaManifest = z.infer<typeof dsaManifestSchema>;

export const TEST_KINDS = ["edge", "random", "stress"] as const;
export const testKindSchema = z.enum(TEST_KINDS);
export type TestKind = z.infer<typeof testKindSchema>;

export const visibleTestSchema = z.object({ input: z.unknown(), expected: z.unknown() }).strict();
export const hiddenTestSchema = z.object({ kind: testKindSchema, input: z.unknown(), expected: z.unknown() }).strict();

/** Output of tests/gen.py: inputs only; expected values are computed by the reference solution. */
export const generatedTestSchema = z.object({ kind: testKindSchema, input: z.unknown() }).strict();

export const metaSchema = z
  .object({
    /** Slowest single test with each reference solution, for the efficiency indicator. */
    ref_time_ms: z.object({ python: z.number(), cpp: z.number() }),
    hidden_count: z.number().int(),
  })
  .strict();
export type DsaMeta = z.infer<typeof metaSchema>;

export const MIN_HIDDEN_TESTS = 15;
export const MIN_VISIBLE_TESTS = 3;
export const MAX_VISIBLE_TESTS = 5;
