import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import { ContentError, formatIssues } from "../dsa/load";
import { behavioralManifestSchema, csManifestSchema, type BehavioralManifest, type CsManifest } from "./manifest";

export interface LoadedCs {
  type: "cs";
  slug: string;
  dir: string;
  manifest: CsManifest;
}

export interface LoadedBehavioral {
  type: "behavioral";
  slug: string;
  dir: string;
  manifest: BehavioralManifest;
}

function readManifest<S extends z.ZodType>(type: string, dir: string, schema: S): z.output<S> {
  const slug = `${type}/${path.basename(dir)}`;
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, "question.yaml"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new ContentError(slug, "question.yaml is missing");
    throw e;
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    throw new ContentError(slug, `question.yaml is not valid YAML: ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ContentError(slug, `question.yaml: ${formatIssues(parsed.error)}`);
  return parsed.data;
}

export function loadCsItem(dir: string): LoadedCs {
  return { type: "cs", slug: path.basename(dir), dir, manifest: readManifest("cs", dir, csManifestSchema) };
}

export function loadBehavioralItem(dir: string): LoadedBehavioral {
  return { type: "behavioral", slug: path.basename(dir), dir, manifest: readManifest("behavioral", dir, behavioralManifestSchema) };
}

// ---- public / private split ---------------------------------------------------------------------
// Public goes to the browser while a round is running. Key points, correct options, and follow-ups stay private.

export interface CsPublic {
  type: "cs";
  slug: string;
  title: string;
  difficulty: CsManifest["difficulty"];
  topics: CsManifest["topics"];
  format: CsManifest["format"];
  prompt: string;
  /** Option texts only: which one is correct is private. */
  options: string[];
}

export interface CsPrivate {
  keyPoints: string[];
  modelAnswer: string;
  followUp: string | null;
  /** Index into `options` of the correct option (MCQ), else null. */
  correctOption: number | null;
}

export function csPublic(item: LoadedCs): CsPublic {
  const m = item.manifest;
  return {
    type: "cs",
    slug: item.slug,
    title: m.title,
    difficulty: m.difficulty,
    topics: m.topics,
    format: m.format,
    prompt: m.prompt,
    options: m.options.map((o) => o.text),
  };
}

export function csPrivate(item: LoadedCs): CsPrivate {
  const m = item.manifest;
  const correct = m.options.findIndex((o) => o.correct);
  return { keyPoints: m.key_points, modelAnswer: m.model_answer, followUp: m.follow_up ?? null, correctOption: correct >= 0 ? correct : null };
}

export interface BehavioralPublic {
  type: "behavioral";
  slug: string;
  title: string;
  competencies: BehavioralManifest["competencies"];
  lenses: BehavioralManifest["lenses"];
  prompt: string;
}

export interface BehavioralPrivate {
  followUps: string[];
  strongSignals: string[];
  redFlags: string[];
  tips: string | null;
}

export function behavioralPublic(item: LoadedBehavioral): BehavioralPublic {
  const m = item.manifest;
  return { type: "behavioral", slug: item.slug, title: m.title, competencies: m.competencies, lenses: m.lenses, prompt: m.prompt };
}

export function behavioralPrivate(item: LoadedBehavioral): BehavioralPrivate {
  const m = item.manifest;
  return { followUps: m.follow_ups, strongSignals: m.strong_signals, redFlags: m.red_flags, tips: m.tips ?? null };
}
