import { z } from "zod";
import { signatureSchema } from "./signature";

/** Supported languages. Each needs a sandbox image, a runner profile, and a codegen module. */
export const LANGUAGES = ["python", "cpp"] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;

export const LANGUAGE_LABELS: Record<Language, string> = {
  python: "Python 3.12",
  cpp: "C++20",
};

export const VERDICTS = [
  "accepted",
  "wrong_answer",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "runtime_error",
  "compile_error",
  /** Ran without an expected output to compare against (custom input). */
  "ran",
  /** Not executed because an earlier test failed or the time budget ran out. */
  "skipped",
] as const;
export const verdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof verdictSchema>;

export const VERDICT_LABELS: Record<Verdict, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  time_limit_exceeded: "Time Limit Exceeded",
  memory_limit_exceeded: "Memory Limit Exceeded",
  runtime_error: "Runtime Error",
  compile_error: "Compile Error",
  ran: "Finished",
  skipped: "Skipped",
};

export const checkerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("exact") }),
  /** Top-level list order doesn't matter; with `nested`, inner lists are unordered too. */
  z.object({ type: z.literal("unordered"), nested: z.boolean().default(false) }),
  z.object({ type: z.literal("float"), tolerance: z.number().positive().max(1).default(1e-6) }),
  /** Python source defining `check(input, expected, actual) -> bool | (bool, str)`. */
  z.object({ type: z.literal("custom"), source: z.string().max(64 * 1024) }),
]);
export type Checker = z.infer<typeof checkerSchema>;

const MB = 1024 * 1024;
export const LIMITS = {
  maxCodeBytes: 256 * 1024,
  maxTests: 200,
  maxBundleBytes: 32 * MB,
  maxFiles: 100,
  maxProjectBytes: 4 * MB,
  defaultTimeLimitMs: 2000,
  maxTimeLimitMs: 10_000,
  defaultMemoryMb: 256,
  maxMemoryMb: 1024,
  defaultSuiteTimeoutMs: 30_000,
  maxSuiteTimeoutMs: 120_000,
  outputCapBytes: 64 * 1024,
} as const;

export const dsaTestSchema = z.object({
  id: z.string().max(64),
  /** Function problems: object keyed by parameter name. Design problems: `{ ops: [...], args: [[...]] }`. */
  input: z.unknown(),
  expected: z.unknown().optional(),
});
export type DsaTest = z.infer<typeof dsaTestSchema>;

export const dsaRunRequestSchema = z.object({
  language: languageSchema,
  code: z.string().max(LIMITS.maxCodeBytes),
  signature: signatureSchema,
  tests: z.array(dsaTestSchema).min(1).max(LIMITS.maxTests),
  checker: checkerSchema.default({ type: "exact" }),
  timeLimitMs: z.number().int().min(100).max(LIMITS.maxTimeLimitMs).default(LIMITS.defaultTimeLimitMs),
  memoryLimitMb: z.number().int().min(32).max(LIMITS.maxMemoryMb).default(LIMITS.defaultMemoryMb),
  stopOnFirstFailure: z.boolean().default(false),
});
export type DsaRunRequest = z.input<typeof dsaRunRequestSchema>;

export const dsaTestResultSchema = z.object({
  id: z.string(),
  verdict: verdictSchema,
  timeMs: z.number().nullable(),
  memoryKb: z.number().nullable(),
  /** JSON-serialized actual output, truncated for display. */
  actual: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  message: z.string().nullable(),
});
export type DsaTestResult = z.infer<typeof dsaTestResultSchema>;

export const dsaRunResultSchema = z.object({
  verdict: verdictSchema,
  passed: z.number().int(),
  total: z.number().int(),
  compileOutput: z.string().nullable(),
  tests: z.array(dsaTestResultSchema),
  maxTimeMs: z.number().nullable(),
  maxMemoryKb: z.number().nullable(),
});
export type DsaRunResult = z.infer<typeof dsaRunResultSchema>;

const relPath = z
  .string()
  .min(1)
  .max(200)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes("..") && !p.includes("\\") && !p.includes("\0"), {
    message: "must be a relative path inside the workspace",
  });

export const projectFilesSchema = z.record(relPath, z.string()).refine((f) => Object.keys(f).length <= LIMITS.maxFiles, {
  message: `at most ${LIMITS.maxFiles} files`,
});

export const TEST_CATEGORIES = ["core", "edge", "extension", "regression", "acceptance"] as const;
export const testCategorySchema = z.enum(TEST_CATEGORIES);
export type TestCategory = z.infer<typeof testCategorySchema>;

export const projectRunRequestSchema = z.object({
  language: languageSchema,
  files: projectFilesSchema,
  /** Shell command run in /work, taken from the item manifest; or `runFile` to run one file. */
  command: z.union([
    z.object({ kind: z.literal("shell"), cmd: z.string().min(1).max(2000) }),
    z.object({ kind: z.literal("runFile"), path: relPath }),
  ]),
  /** Where the command writes machine-readable results (JUnit XML or JSON), relative to /work. */
  results: z.object({ format: z.enum(["junit", "json"]), path: relPath }).optional(),
  /** First matching regex (against "classname.name") assigns the category; default "core". */
  categories: z.array(z.object({ pattern: z.string().max(200), category: testCategorySchema })).max(50).default([]),
  timeoutMs: z.number().int().min(1000).max(LIMITS.maxSuiteTimeoutMs).default(LIMITS.defaultSuiteTimeoutMs),
  memoryLimitMb: z.number().int().min(32).max(LIMITS.maxMemoryMb).default(LIMITS.defaultMemoryMb),
  stdin: z.string().max(LIMITS.outputCapBytes).default(""),
});
export type ProjectRunRequest = z.input<typeof projectRunRequestSchema>;

export const projectTestResultSchema = z.object({
  name: z.string(),
  classname: z.string(),
  status: z.enum(["passed", "failed", "error", "skipped"]),
  message: z.string().nullable(),
  timeMs: z.number().nullable(),
  category: testCategorySchema,
});
export type ProjectTestResult = z.infer<typeof projectTestResultSchema>;

export const projectRunResultSchema = z.object({
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
  oomKilled: z.boolean(),
  durationMs: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  stdoutTruncated: z.boolean(),
  stderrTruncated: z.boolean(),
  /** Null when no results file was requested or it wasn't produced. */
  tests: z.array(projectTestResultSchema).nullable(),
  resultsError: z.string().nullable(),
});
export type ProjectRunResult = z.infer<typeof projectRunResultSchema>;

export const runnerHealthSchema = z.object({
  ok: z.boolean(),
  docker: z.boolean(),
  version: z.string(),
  languages: z.record(languageSchema, z.boolean()),
  error: z.string().nullable(),
});
export type RunnerHealth = z.infer<typeof runnerHealthSchema>;
