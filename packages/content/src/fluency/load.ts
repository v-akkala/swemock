import fs from "node:fs";
import path from "node:path";
import type { Language } from "@swemock/shared";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import { ContentError, formatIssues } from "../dsa/load";
import {
  comprehensionSchema,
  extensionSchema,
  reviewSchema,
  type ComprehensionManifest,
  type ExtensionManifest,
  type ReviewManifest,
} from "./manifest";

type FileMap = Record<string, string>;

export interface FluencyCommand {
  id: string;
  label: string;
  cmd: string;
  results?: string;
}

/** The default run-panel command: Python items run pytest over tests/ (results parsed from JUnit). */
export const DEFAULT_TEST_COMMAND: FluencyCommand = {
  id: "tests",
  label: "Run tests",
  cmd: "mkdir -p .results && python3 -m pytest -q -p no:cacheprovider --junitxml=.results/junit.xml tests",
  results: ".results/junit.xml",
};

export function commandsFor(language: Language, extra: FluencyCommand[]): FluencyCommand[] {
  return [...(language === "python" ? [DEFAULT_TEST_COMMAND] : []), ...extra];
}

function readTree(dir: string): FileMap {
  const out: FileMap = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "__pycache__") continue;
      const next = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(next);
      else out[next] = fs.readFileSync(path.join(dir, next), "utf8");
    }
  };
  walk("");
  return out;
}

const prefixed = (prefix: string, files: FileMap): FileMap => Object.fromEntries(Object.entries(files).map(([p, t]) => [`${prefix}/${p}`, t]));

function manifestOf<S extends z.ZodType>(type: string, dir: string, schema: S): z.output<S> {
  const label = `${type}/${path.basename(dir)}`;
  const file = path.join(dir, "item.yaml");
  if (!fs.existsSync(file)) throw new ContentError(label, "item.yaml is missing");
  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new ContentError(label, `item.yaml is not valid YAML: ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ContentError(label, `item.yaml: ${formatIssues(parsed.error)}`);
  return parsed.data;
}

function required(type: string, dir: string, file: string): string {
  const p = path.join(dir, file);
  const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (!text.trim()) throw new ContentError(`${type}/${path.basename(dir)}`, `${file} is missing or empty`);
  return text;
}

function checkIssueFiles(type: string, slug: string, issues: { id: string; file: string; fix?: { file: string } }[], files: FileMap, what: string): void {
  const ids = new Set<string>();
  for (const i of issues) {
    if (ids.has(i.id)) throw new ContentError(`${type}/${slug}`, `duplicate id "${i.id}"`);
    ids.add(i.id);
    if (!(i.file in files)) throw new ContentError(`${type}/${slug}`, `${i.id}: ${i.file} is not in ${what}`);
    if (i.fix && !(i.fix.file in files)) throw new ContentError(`${type}/${slug}`, `${i.id}: fix targets ${i.fix.file}, which is not in ${what}`);
  }
}

// ---- comprehension ------------------------------------------------------------------------------

export interface LoadedComprehension {
  type: "comprehension";
  slug: string;
  dir: string;
  manifest: ComprehensionManifest;
  /** The codebase (read-only reading material, but the candidate may add tests). */
  code: FileMap;
  /** Tests that ship with the codebase, shown and runnable. */
  tests: FileMap;
  /** Hidden tests, one per planted bug (`test_bug_<id>`), that prove it. */
  bugTests: FileMap;
}

export function loadComprehensionItem(dir: string): LoadedComprehension {
  const slug = path.basename(dir);
  const manifest = manifestOf("comprehension", dir, comprehensionSchema);
  const code = readTree(path.join(dir, "code"));
  if (Object.keys(code).length === 0) throw new ContentError(`comprehension/${slug}`, "code/ is empty");
  checkIssueFiles("comprehension", slug, manifest.bugs, code, "code/");
  return { type: "comprehension", slug, dir, manifest, code, tests: prefixed("tests", readTree(path.join(dir, "tests"))), bugTests: prefixed("tests/hidden", readTree(path.join(dir, "bugtests"))) };
}

// ---- review -------------------------------------------------------------------------------------

export interface LoadedReview {
  type: "review";
  slug: string;
  dir: string;
  manifest: ReviewManifest;
  /** The repository before the PR and after it (the PR's head). */
  base: FileMap;
  head: FileMap;
  /** Tests that ship with the head (may be hollow). */
  tests: FileMap;
  /** Hidden tests the "Fix it" branch is checked against. */
  hiddenTests: FileMap;
}

export function loadReviewItem(dir: string): LoadedReview {
  const slug = path.basename(dir);
  const manifest = manifestOf("review", dir, reviewSchema);
  const base = readTree(path.join(dir, "base"));
  const head = readTree(path.join(dir, "head"));
  if (Object.keys(head).length === 0) throw new ContentError(`review/${slug}`, "head/ is empty");
  checkIssueFiles("review", slug, manifest.issues, head, "head/");
  return {
    type: "review",
    slug,
    dir,
    manifest,
    base,
    head,
    tests: prefixed("tests", readTree(path.join(dir, "tests"))),
    hiddenTests: prefixed("tests/hidden", readTree(path.join(dir, "tests_hidden"))),
  };
}

// ---- extension ----------------------------------------------------------------------------------

export interface LoadedExtension {
  type: "extension";
  slug: string;
  dir: string;
  manifest: ExtensionManifest;
  ticketMd: string;
  /** The repository, including CONVENTIONS.md, and its existing tests under tests/. */
  repo: FileMap;
  hiddenTests: FileMap;
  /** Changed or added files of the model implementation, overlaid on `repo`. */
  reference: FileMap;
}

export function loadExtensionItem(dir: string): LoadedExtension {
  const slug = path.basename(dir);
  const manifest = manifestOf("extension", dir, extensionSchema);
  const repo = readTree(path.join(dir, "repo"));
  if (!("CONVENTIONS.md" in repo)) throw new ContentError(`extension/${slug}`, "repo/CONVENTIONS.md is missing");
  const reference = readTree(path.join(dir, "reference"));
  if (Object.keys(reference).length === 0) throw new ContentError(`extension/${slug}`, "reference/ is empty");
  return {
    type: "extension",
    slug,
    dir,
    manifest,
    ticketMd: required("extension", dir, "ticket.md"),
    repo,
    hiddenTests: prefixed("tests/hidden", readTree(path.join(dir, "tests_hidden"))),
    reference,
  };
}

// ---- public / private split ---------------------------------------------------------------------

interface PublicBase {
  slug: string;
  title: string;
  difficulty: string;
  tags: string[];
  language: Language;
  minutes: number;
  commands: FluencyCommand[];
}

const pubBase = (item: { slug: string; manifest: { title: string; difficulty: string; tags: string[]; language: Language; minutes: number; commands: FluencyCommand[] } }): PublicBase => ({
  slug: item.slug,
  title: item.manifest.title,
  difficulty: item.manifest.difficulty,
  tags: item.manifest.tags,
  language: item.manifest.language,
  minutes: item.manifest.minutes,
  commands: commandsFor(item.manifest.language, item.manifest.commands),
});

export interface ComprehensionPublic extends PublicBase {
  type: "comprehension";
  brief: string;
  files: FileMap;
  /** Shipping tests: shown, runnable, and the place to add your own. */
  tests: FileMap;
  bugCount: number;
}
export interface ComprehensionPrivate {
  manifest: Pick<ComprehensionManifest, "bugs" | "decisions" | "improvements" | "acceptable" | "questions">;
  bugTests: FileMap;
}

export const comprehensionPublic = (i: LoadedComprehension): ComprehensionPublic => ({ type: "comprehension", ...pubBase(i), brief: i.manifest.brief, files: i.code, tests: i.tests, bugCount: i.manifest.bugs.length });
export const comprehensionPrivate = (i: LoadedComprehension): ComprehensionPrivate => ({
  manifest: { bugs: i.manifest.bugs, decisions: i.manifest.decisions, improvements: i.manifest.improvements, acceptable: i.manifest.acceptable, questions: i.manifest.questions },
  bugTests: i.bugTests,
});

export interface ReviewPublic extends PublicBase {
  type: "review";
  pr: { title: string; description: string };
  base: FileMap;
  head: FileMap;
  tests: FileMap;
}
export interface ReviewPrivate {
  decision: ReviewManifest["decision"];
  issues: ReviewManifest["issues"];
  acceptable: ReviewManifest["acceptable"];
  questions: string[];
  hiddenTests: FileMap;
}

export const reviewPublic = (i: LoadedReview): ReviewPublic => ({ type: "review", ...pubBase(i), pr: i.manifest.pr, base: i.base, head: i.head, tests: i.tests });
export const reviewPrivate = (i: LoadedReview): ReviewPrivate => ({ decision: i.manifest.decision, issues: i.manifest.issues, acceptable: i.manifest.acceptable, questions: i.manifest.questions, hiddenTests: i.hiddenTests });

export interface ExtensionPublic extends PublicBase {
  type: "extension";
  ticketMd: string;
  files: FileMap;
}
export interface ExtensionPrivate {
  hiddenTests: FileMap;
  reference: FileMap;
  questions: string[];
}

export const extensionPublic = (i: LoadedExtension): ExtensionPublic => ({ type: "extension", ...pubBase(i), ticketMd: i.ticketMd, files: i.repo });
export const extensionPrivate = (i: LoadedExtension): ExtensionPrivate => ({ hiddenTests: i.hiddenTests, reference: i.reference, questions: i.manifest.questions });
