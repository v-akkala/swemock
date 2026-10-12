import fs from "node:fs";
import path from "node:path";
import { LIMITS, type Checker, type DsaTest, type Language } from "@swemock/shared";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  dsaManifestSchema,
  hiddenTestSchema,
  metaSchema,
  visibleTestSchema,
  type DsaManifest,
  type DsaMeta,
  type TestKind,
} from "./manifest";

export interface VisibleCase {
  id: string;
  input: unknown;
  expected: unknown;
}

export interface HiddenCase extends VisibleCase {
  kind: TestKind;
}

export interface LoadedDsa {
  type: "dsa";
  slug: string;
  dir: string;
  manifest: DsaManifest;
  /** The manifest's checker with custom checker source inlined. */
  checker: Checker;
  statementMd: string;
  editorialMd: string;
  references: Partial<Record<Language, string>>;
  brute: string | null;
  generator: string | null;
  visible: VisibleCase[];
  hidden: HiddenCase[];
  meta: DsaMeta | null;
}

export class ContentError extends Error {
  constructor(
    readonly slug: string,
    message: string,
  ) {
    super(`${slug}: ${message}`);
  }
}

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function readJson<S extends z.ZodType>(slug: string, file: string, schema: S): z.output<S> | null {
  const raw = readIfExists(file);
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new ContentError(slug, `${path.basename(file)} is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ContentError(slug, `${path.basename(file)}: ${formatIssues(parsed.error)}`);
  return parsed.data;
}

export function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

/** Reads one problem folder. Throws ContentError with a readable message if the files are malformed. */
export function loadDsaItem(dir: string): LoadedDsa {
  const slug = path.basename(dir);
  const yamlText = readIfExists(path.join(dir, "problem.yaml"));
  if (yamlText === null) throw new ContentError(slug, "problem.yaml is missing");
  let rawManifest: unknown;
  try {
    rawManifest = parseYaml(yamlText);
  } catch (e) {
    throw new ContentError(slug, `problem.yaml is not valid YAML: ${(e as Error).message}`);
  }
  const parsed = dsaManifestSchema.safeParse(rawManifest);
  if (!parsed.success) throw new ContentError(slug, `problem.yaml: ${formatIssues(parsed.error)}`);
  const manifest = parsed.data;

  let checker: Checker;
  if (manifest.checker.type === "custom") {
    const source = readIfExists(path.join(dir, manifest.checker.file));
    if (source === null) throw new ContentError(slug, `checker file ${manifest.checker.file} is missing`);
    if (Buffer.byteLength(source) > 64 * 1024) throw new ContentError(slug, "checker file is larger than 64KB");
    checker = { type: "custom", source };
  } else {
    checker = manifest.checker as Checker;
  }

  const statementMd = readIfExists(path.join(dir, "statement.md"));
  if (!statementMd?.trim()) throw new ContentError(slug, "statement.md is missing or empty");
  const editorialMd = readIfExists(path.join(dir, "editorial.md"));
  if (!editorialMd?.trim()) throw new ContentError(slug, "editorial.md is missing or empty");

  const visibleRaw = readJson(slug, path.join(dir, "tests/visible.json"), z.array(visibleTestSchema));
  if (!visibleRaw) throw new ContentError(slug, "tests/visible.json is missing");
  const hiddenRaw = readJson(slug, path.join(dir, "tests/hidden.json"), z.array(hiddenTestSchema)) ?? [];
  const meta = readJson(slug, path.join(dir, "tests/meta.json"), metaSchema);

  return {
    type: "dsa",
    slug,
    dir,
    manifest,
    checker,
    statementMd,
    editorialMd,
    references: {
      python: readIfExists(path.join(dir, "solutions/reference.py")) ?? undefined,
      cpp: readIfExists(path.join(dir, "solutions/reference.cpp")) ?? undefined,
    },
    brute: readIfExists(path.join(dir, "solutions/brute.py")),
    generator: readIfExists(path.join(dir, "tests/gen.py")),
    visible: visibleRaw.map((t, i) => ({ id: `v${i + 1}`, input: t.input, expected: t.expected })),
    hidden: hiddenRaw.map((t, i) => ({ id: `h${i + 1}`, kind: t.kind, input: t.input, expected: t.expected })),
    meta,
  };
}

// ---- Public / private split ---------------------------------------------------------------------
// `public` goes to the browser. `private` holds everything that must stay hidden until the debrief.

export interface DsaPublic {
  type: "dsa";
  slug: string;
  title: string;
  difficulty: DsaManifest["difficulty"];
  tags: DsaManifest["tags"];
  companies: string[];
  statementMd: string;
  signature: DsaManifest["signature"];
  visibleTests: VisibleCase[];
  limits: { timeMs: number; memoryMb: number };
  hintCount: number;
}

export interface DsaPrivate {
  hints: string[];
  editorialMd: string;
  followups: string[];
  checker: Checker;
  hiddenTests: HiddenCase[];
  references: Partial<Record<Language, string>>;
  meta: DsaMeta | null;
}

export function toPublic(item: LoadedDsa): DsaPublic {
  const m = item.manifest;
  return {
    type: "dsa",
    slug: item.slug,
    title: m.title,
    difficulty: m.difficulty,
    tags: m.tags,
    companies: m.companies,
    statementMd: item.statementMd,
    signature: m.signature,
    visibleTests: item.visible,
    limits: { timeMs: m.limits.time_ms, memoryMb: m.limits.memory_mb },
    hintCount: m.hints.length,
  };
}

export function toPrivate(item: LoadedDsa): DsaPrivate {
  return {
    hints: [...item.manifest.hints],
    editorialMd: item.editorialMd,
    followups: item.manifest.followups,
    checker: item.checker,
    hiddenTests: item.hidden,
    references: item.references,
    meta: item.meta,
  };
}

export function toRunnerTests(cases: VisibleCase[]): DsaTest[] {
  return cases.map((c) => ({ id: c.id, input: c.input, expected: c.expected }));
}

export const CONTENT_SIZE_LIMITS = { hiddenBytes: 8 * 1024 * 1024, maxBundleBytes: LIMITS.maxBundleBytes };
