#!/usr/bin/env -S pnpm exec tsx
/**
 * Content tooling:
 *   pnpm content:new dsa <slug> [--title "Title"] [--difficulty easy|medium|hard]
 *   pnpm content:gen <slug...|--all>        run tests/gen.py, compute expected outputs, write tests/
 *   pnpm content:validate [slug...|--all]   no arguments: only items changed vs main
 * Needs Docker and the sandbox images (docker compose build sandbox-python sandbox-cpp).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { itemDirs } from "@swemock/content";
import { genDsa, validateDsa } from "./lib/dsa";
import { createJudge } from "./lib/judge";
import { scaffoldDsa } from "./lib/scaffold";

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

/** Items touched since main (committed, staged, unstaged, or untracked). */
function changedItems(): string[] {
  const base = git("merge-base", "HEAD", "main").trim() || git("merge-base", "HEAD", "origin/main").trim() || "HEAD";
  const paths = [
    ...git("diff", "--name-only", base, "--", "content").split("\n"),
    ...git("ls-files", "--others", "--exclude-standard", "--", "content").split("\n"),
  ];
  const slugs = new Set<string>();
  for (const p of paths) {
    const m = /^content\/dsa\/([^/]+)\//.exec(p);
    if (m) slugs.add(m[1]!);
  }
  return [...slugs].filter((s) => itemDirs(CONTENT, "dsa").some((d) => path.basename(d) === s)).sort();
}

function resolveTargets(args: string[], { defaultChanged }: { defaultChanged: boolean }): string[] {
  const dirs = itemDirs(CONTENT, "dsa");
  const names = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--all")) return dirs;
  if (names.length === 0) {
    if (!defaultChanged) throw new Error("Name an item (for example: dsa/two-pointer-demo) or pass --all");
    return changedItems().map((s) => path.join(CONTENT, "dsa", s));
  }
  return names.map((n) => {
    const slug = n.replace(/^(content\/)?dsa\//, "").replace(/\/$/, "");
    const dir = dirs.find((d) => path.basename(d) === slug);
    if (!dir) throw new Error(`No item named "${n}" under content/dsa`);
    return dir;
  });
}

async function main(): Promise<number> {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "new") {
    const [type, slug] = args;
    if (type !== "dsa" || !slug) throw new Error("Usage: pnpm content:new dsa <slug> [--title ...] [--difficulty ...]");
    const dest = scaffoldDsa(CONTENT, slug, { title: flag(args, "--title"), difficulty: flag(args, "--difficulty") });
    console.log(`Created ${path.relative(REPO, dest)}

Next:
  1. Edit problem.yaml, statement.md, editorial.md, solutions/, tests/gen.py (guide: prompts/authoring/dsa.md)
  2. pnpm content:gen ${slug}        compute the hidden tests
  3. pnpm content:validate ${slug}   check everything
  4. Delete the SCAFFOLD line at the top of problem.yaml`);
    return 0;
  }

  if (cmd === "gen") {
    const targets = resolveTargets(args, { defaultChanged: false });
    const judge = await createJudge();
    for (const dir of targets) {
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
    const judge = await createJudge();
    let failed = 0;
    for (const dir of targets) {
      const slug = path.basename(dir);
      const started = Date.now();
      const report = await validateDsa(judge, dir);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (report.errors.length === 0) console.log(`✓ dsa/${slug} (${secs}s)`);
      else {
        failed++;
        console.log(`✗ dsa/${slug} (${secs}s)`);
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
