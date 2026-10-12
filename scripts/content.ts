#!/usr/bin/env -S pnpm exec tsx
/**
 * Content tooling:
 *   pnpm content:new <dsa|cs|behavioral> <slug> [--title "Title"] [--difficulty easy|medium|hard]
 *   pnpm content:gen <slug...|--all>        DSA only: run tests/gen.py, compute expected outputs, write tests/
 *   pnpm content:validate [type/slug...|--all|--type cs]   no arguments: only items changed vs main
 * DSA items need Docker and the sandbox images (docker compose build sandbox-python sandbox-cpp);
 * questions (cs, behavioral) are checked statically.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { CONTENT_TYPES, itemDirs, type ContentType } from "@swemock/content";
import { genDsa, validateDsa } from "./lib/dsa";
import { createJudge } from "./lib/judge";
import { registerQuestion, validateQuestion } from "./lib/questions";
import { scaffold } from "./lib/scaffold";

const REPO = path.resolve(import.meta.dirname, "..");
const CONTENT = path.join(REPO, "content");

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function git(...args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

interface Target {
  type: ContentType;
  dir: string;
}

const label = (t: Target) => `${t.type}/${path.basename(t.dir)}`;
const allTargets = (): Target[] => CONTENT_TYPES.flatMap((type) => itemDirs(CONTENT, type).map((dir) => ({ type, dir })));

/** Items touched since main (committed, staged, unstaged, or untracked). */
function changedItems(): Target[] {
  const base = git("merge-base", "HEAD", "main").trim() || git("merge-base", "HEAD", "origin/main").trim() || "HEAD";
  const paths = [
    ...git("diff", "--name-only", base, "--", "content").split("\n"),
    ...git("ls-files", "--others", "--exclude-standard", "--", "content").split("\n"),
  ];
  const wanted = new Set<string>();
  for (const p of paths) {
    const m = /^content\/([^/]+)\/([^/]+)\//.exec(p);
    if (m) wanted.add(`${m[1]}/${m[2]}`);
  }
  return allTargets().filter((t) => wanted.has(label(t))).sort((a, b) => label(a).localeCompare(label(b)));
}

function resolveTargets(args: string[], { defaultChanged, dsaOnly = false }: { defaultChanged: boolean; dsaOnly?: boolean }): Target[] {
  const pool = allTargets().filter((t) => !dsaOnly || t.type === "dsa");
  const names = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--type");
  const onlyType = flag(args, "--type");
  if (onlyType && !CONTENT_TYPES.includes(onlyType as ContentType)) throw new Error(`Unknown --type "${onlyType}" (use ${CONTENT_TYPES.join(", ")})`);
  if (args.includes("--all") || (onlyType && names.length === 0)) return pool.filter((t) => !onlyType || t.type === onlyType);
  if (names.length === 0) {
    if (!defaultChanged) throw new Error("Name an item (for example: dsa/merge-ranges) or pass --all");
    return changedItems().filter((t) => !dsaOnly || t.type === "dsa");
  }
  return names.map((n) => {
    const clean = n.replace(/^(content\/)?/, "").replace(/\/$/, "");
    const matches = pool.filter((t) => label(t) === clean || (!clean.includes("/") && path.basename(t.dir) === clean));
    if (matches.length === 0) throw new Error(`No item named "${n}" under content/`);
    if (matches.length > 1) throw new Error(`"${n}" is ambiguous (${matches.map(label).join(", ")}); write type/slug`);
    return matches[0]!;
  });
}

async function main(): Promise<number> {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "new") {
    const [type, slug] = args;
    if (!type || !(CONTENT_TYPES as readonly string[]).includes(type) || !slug) {
      throw new Error("Usage: pnpm content:new <dsa|cs|behavioral> <slug> [--title ...] [--difficulty ...]");
    }
    const dest = scaffold(type as ContentType, CONTENT, slug, { title: flag(args, "--title"), difficulty: flag(args, "--difficulty") });
    if (type === "dsa") {
      console.log(`Created ${path.relative(REPO, dest)}

Next:
  1. Edit problem.yaml, statement.md, editorial.md, solutions/, tests/gen.py (guide: prompts/authoring/dsa.md)
  2. pnpm content:gen ${slug}        compute the hidden tests
  3. pnpm content:validate ${slug}   check everything
  4. Delete the SCAFFOLD line at the top of problem.yaml`);
    } else {
      console.log(`Created ${path.relative(REPO, dest)}

Next:
  1. Edit question.yaml (guide: prompts/authoring/${type}.md)
  2. pnpm content:validate ${type}/${slug}   check it (no Docker needed)
  3. Delete the SCAFFOLD line at the top of question.yaml`);
    }
    return 0;
  }

  if (cmd === "gen") {
    const targets = resolveTargets(args, { defaultChanged: false, dsaOnly: true });
    const judge = await createJudge();
    for (const { dir } of targets) {
      const slug = path.basename(dir);
      console.log(`\n${slug}`);
      await genDsa(judge, dir, (m) => console.log(`  ${m}`));
    }
    console.log(`\nGenerated tests for ${targets.length} item(s). Run pnpm content:validate next.`);
    return 0;
  }

  if (cmd === "validate") {
    const targets = resolveTargets(args, { defaultChanged: true });
    if (targets.length === 0) {
      console.log("No changed content to validate (use --all to check everything).");
      return 0;
    }
    // Only DSA items need the sandbox; don't require Docker to check a batch of questions.
    const judge = targets.some((t) => t.type === "dsa") ? await createJudge() : null;
    const seen = new Map<string, string>();
    for (const t of allTargets()) if (t.type !== "dsa") registerQuestion(t.type, t.dir, seen);
    let failed = 0;
    for (const target of targets) {
      const started = Date.now();
      const report = target.type === "dsa" ? await validateDsa(judge!, target.dir) : validateQuestion(target.type, target.dir, seen);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (report.errors.length === 0) console.log(`✓ ${label(target)} (${secs}s)`);
      else {
        failed++;
        console.log(`✗ ${label(target)} (${secs}s)`);
        for (const e of report.errors) console.log(`    ${e.replace(/\n/g, "\n      ")}`);
      }
      for (const w of report.warnings) console.log(`    warning: ${w}`);
    }
    console.log(failed ? `\n${failed} of ${targets.length} item(s) failed validation.` : `\nAll ${targets.length} item(s) valid.`);
    return failed ? 1 : 0;
  }

  console.error("Usage: content <new|gen|validate> ...");
  return 2;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
