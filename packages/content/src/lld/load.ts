import fs from "node:fs";
import path from "node:path";
import { LANGUAGES, type Language } from "@swemock/shared";
import { parse as parseYaml } from "yaml";
import { ContentError, formatIssues } from "../dsa/load";
import { lldManifestSchema, type LldManifest } from "./manifest";

export type FileMap = Record<string, string>;

export interface LldLanguageFiles {
  /** Starting content of every editor file. */
  starter: FileMap;
  /** The model solution: overlays `starter`. */
  reference: FileMap;
  /** Workspace plumbing the candidate never sees (conftest.py). */
  support: FileMap;
  tests: { visible: FileMap; hidden: FileMap; extension: FileMap };
}

export interface LoadedLld {
  type: "lld";
  slug: string;
  dir: string;
  manifest: LldManifest;
  specMd: string;
  designMd: string;
  diagram: string;
  /** The authored requirement change, introduced at about 60% of an interview. */
  changeMd: string;
  languages: Partial<Record<Language, LldLanguageFiles>>;
}

/** Every file under `dir` as `relative/path → text`. */
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

function required(slug: string, dir: string, file: string): string {
  const p = path.join(dir, file);
  const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (!text.trim()) throw new ContentError(`lld/${slug}`, `${file} is missing or empty`);
  return text;
}

export function loadLldItem(dir: string): LoadedLld {
  const slug = path.basename(dir);
  const label = `lld/${slug}`;
  const yamlPath = path.join(dir, "problem.yaml");
  if (!fs.existsSync(yamlPath)) throw new ContentError(label, "problem.yaml is missing");
  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(yamlPath, "utf8"));
  } catch (e) {
    throw new ContentError(label, `problem.yaml is not valid YAML: ${(e as Error).message}`);
  }
  const parsed = lldManifestSchema.safeParse(raw);
  if (!parsed.success) throw new ContentError(label, `problem.yaml: ${formatIssues(parsed.error)}`);
  const manifest = parsed.data;

  const languages: LoadedLld["languages"] = {};
  for (const lang of LANGUAGES) {
    if (!manifest.languages[lang]) continue;
    const base = path.join(dir, lang);
    const tests = readTree(path.join(base, "tests"));
    const under = (prefix: string): FileMap =>
      Object.fromEntries(Object.entries(tests).filter(([p]) => p.startsWith(`${prefix}/`)).map(([p, t]) => [`tests/${p}`, t]));
    const files = {
      starter: readTree(path.join(base, "starter")),
      reference: readTree(path.join(base, "reference")),
      support: readTree(path.join(base, "support")),
      tests: { visible: under("visible"), hidden: under("hidden"), extension: under("extension") },
    };
    for (const f of manifest.languages[lang]!.files) {
      if (!(f.path in files.starter)) throw new ContentError(label, `${lang}/starter/${f.path} is missing`);
    }
    languages[lang] = files;
  }

  return {
    type: "lld",
    slug,
    dir,
    manifest,
    specMd: required(slug, dir, "spec.md"),
    designMd: required(slug, dir, "design.md"),
    diagram: required(slug, dir, "diagram.mmd"),
    changeMd: required(slug, dir, "change.md"),
    languages,
  };
}

// ---- public / private split ---------------------------------------------------------------------

export interface LldPublic {
  type: "lld";
  slug: string;
  title: string;
  difficulty: LldManifest["difficulty"];
  tags: LldManifest["tags"];
  format: LldManifest["format"];
  minutes: number;
  specMd: string;
  hintCount: number;
  languages: Partial<
    Record<
      Language,
      {
        files: { path: string; role: "provided" | "solution"; content: string }[];
        /** Read-only: the tests the candidate can run any time. */
        visibleTests: FileMap;
      }
    >
  >;
}

export interface LldPrivate {
  hints: string[];
  designMd: string;
  diagram: string;
  changeMd: string;
  followups: string[];
  languages: Partial<Record<Language, { reference: FileMap; support: FileMap; hidden: FileMap; extension: FileMap }>>;
}

export function lldPublic(item: LoadedLld): LldPublic {
  const m = item.manifest;
  const languages: LldPublic["languages"] = {};
  for (const lang of LANGUAGES) {
    const spec = m.languages[lang];
    const files = item.languages[lang];
    if (!spec || !files) continue;
    languages[lang] = {
      files: spec.files.map((f) => ({ path: f.path, role: f.role, content: files.starter[f.path]! })),
      visibleTests: files.tests.visible,
    };
  }
  return {
    type: "lld",
    slug: item.slug,
    title: m.title,
    difficulty: m.difficulty,
    tags: m.tags,
    format: m.format,
    minutes: m.minutes,
    specMd: item.specMd,
    hintCount: m.hints.length,
    languages,
  };
}

export function lldPrivate(item: LoadedLld): LldPrivate {
  const languages: LldPrivate["languages"] = {};
  for (const lang of LANGUAGES) {
    const files = item.languages[lang];
    if (!files) continue;
    languages[lang] = { reference: files.reference, support: files.support, hidden: files.tests.hidden, extension: files.tests.extension };
  }
  return { hints: [...item.manifest.hints], designMd: item.designMd, diagram: item.diagram, changeMd: item.changeMd, followups: item.manifest.followups, languages };
}
