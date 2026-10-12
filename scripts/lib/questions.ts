import fs from "node:fs";
import path from "node:path";
import { SLUG_RE, loadBehavioralItem, loadCsItem, type ContentType } from "@swemock/content";

export interface Report {
  errors: string[];
  warnings: string[];
}

/** Registers every question on disk so a new item is checked against the existing ones, not just its batch. */
export function registerQuestion(type: Exclude<ContentType, "dsa">, dir: string, seen: Map<string, string>): void {
  try {
    const m = type === "cs" ? loadCsItem(dir).manifest : loadBehavioralItem(dir).manifest;
    for (const [kind, text] of [["title", m.title], ["prompt", m.prompt]] as const) seen.set(`${type}:${kind}:${norm(text)}`, path.basename(dir));
  } catch {
    /* a broken item is reported when it's validated itself */
  }
}

const words = (s: string) => s.trim().split(/\s+/).length;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Static validation for question content (no sandbox needed). The schema already enforces key points, one
 * correct MCQ option, and 3–5 follow-ups; this adds the checks a schema can't express.
 * `seen` carries titles and prompts across the items of one run, to catch duplicates.
 */
export function validateQuestion(type: Exclude<ContentType, "dsa">, dir: string, seen: Map<string, string>): Report {
  const report: Report = { errors: [], warnings: [] };
  const fail = (m: string) => report.errors.push(m);
  const warn = (m: string) => report.warnings.push(m);
  const slug = path.basename(dir);
  if (!SLUG_RE.test(slug)) fail(`folder name "${slug}" must be lowercase words separated by hyphens`);

  try {
    if (fs.readFileSync(path.join(dir, "question.yaml"), "utf8").includes("SCAFFOLD")) {
      fail("question.yaml still has the SCAFFOLD marker; finish the question, then delete that line");
    }
  } catch {
    /* the loader reports a missing file */
  }

  const dup = (kind: string, text: string) => {
    const key = `${type}:${kind}:${norm(text)}`;
    const other = seen.get(key);
    if (other && other !== slug) fail(`${kind} duplicates ${type}/${other}`);
    else seen.set(key, slug);
  };

  try {
    if (type === "cs") {
      const m = loadCsItem(dir).manifest;
      dup("title", m.title);
      dup("prompt", m.prompt);
      if (new Set(m.key_points.map(norm)).size !== m.key_points.length) fail("key_points must be distinct");
      if (words(m.model_answer) < 15) fail("model_answer is too short to be useful (under 15 words)");
      if (!/\?|\b(explain|describe|compare|contrast|name|list|what|why|how|when|which|walk)\b/i.test(m.prompt)) warn("prompt doesn't read like a question");
      if (m.format === "mcq" && new Set(m.options.map((o) => norm(o.text))).size !== m.options.length) fail("MCQ options must be distinct");
    } else {
      const m = loadBehavioralItem(dir).manifest;
      dup("title", m.title);
      dup("prompt", m.prompt);
      if (new Set(m.follow_ups.map(norm)).size !== m.follow_ups.length) fail("follow_ups must be distinct");
      for (const f of m.follow_ups) if (!f.trim().endsWith("?")) warn(`follow-up isn't a question: "${f.slice(0, 50)}"`);
      if (!/\b(tell me|describe|walk me|give me|have you|how do you|how would you|what|why|when|share)\b/i.test(m.prompt)) warn("prompt doesn't read like a question");
    }
  } catch (e) {
    fail((e as Error).message);
  }
  return report;
}
