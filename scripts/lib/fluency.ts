import fs from "node:fs";
import path from "node:path";
import { type Language, type ProjectRunResult } from "@swemock/shared";
import { SLUG_RE, commandsFor, loadComprehensionItem, loadExtensionItem, loadReviewItem, type Fix } from "@swemock/content";
import type { Judge } from "../../services/runner/src/judge";
import type { Report } from "./questions";

type FileMap = Record<string, string>;

export function applyFix(files: FileMap, fix: Fix): FileMap {
  const text = files[fix.file];
  if (text === undefined) throw new Error(`fix targets ${fix.file}, which doesn't exist`);
  const at = text.indexOf(fix.old);
  if (at < 0) throw new Error(`fix for ${fix.file}: the "old" text isn't in the file (${JSON.stringify(fix.old.slice(0, 40))}…)`);
  if (text.indexOf(fix.old, at + 1) >= 0) throw new Error(`fix for ${fix.file}: the "old" text appears more than once; make it longer`);
  return { ...files, [fix.file]: text.slice(0, at) + fix.new + text.slice(at + fix.old.length) };
}

const lineOf = (text: string, snippet: string) => text.slice(0, text.indexOf(snippet)).split("\n").length;

function run(judge: Judge, language: Language, files: FileMap, command: ReturnType<typeof commandsFor>[number]): Promise<ProjectRunResult> {
  return judge.runProject({
    language,
    files,
    command: { kind: "shell", cmd: command.cmd },
    results: command.results ? { format: "junit", path: command.results } : undefined,
    categories: [{ pattern: "acceptance", category: "acceptance" }, { pattern: ".", category: "regression" }],
    timeoutMs: 120_000,
  });
}

const summary = (r: ProjectRunResult): string => {
  const failed = (r.tests ?? []).filter((t) => t.status !== "passed").slice(0, 6).map((t) => `  ${t.classname}.${t.name}: ${t.message?.split("\n")[0] ?? t.status}`);
  return failed.length ? failed.join("\n") : (r.stderr || r.stdout).trim().split("\n").slice(-10).join("\n");
};
const allPass = (r: ProjectRunResult) => r.tests !== null && r.tests.length > 0 && r.exitCode === 0 && r.tests.every((t) => t.status === "passed");
const failedNames = (r: ProjectRunResult) => new Set((r.tests ?? []).filter((t) => t.status !== "passed").map((t) => t.name));

function common(dir: string, report: Report): void {
  const slug = path.basename(dir);
  if (!SLUG_RE.test(slug)) report.errors.push(`folder name "${slug}" must be lowercase words separated by hyphens`);
  if (fs.readFileSync(path.join(dir, "item.yaml"), "utf8").includes("SCAFFOLD")) report.errors.push("item.yaml still has the SCAFFOLD marker; finish the item, then delete that line");
}

const countLines = (files: FileMap) => Object.values(files).reduce((n, t) => n + t.split("\n").length, 0);

export async function validateComprehension(judge: Judge, dir: string): Promise<Report> {
  try {
    return await validateComprehensionInner(judge, dir);
  } catch (e) {
    return { errors: [(e as Error).message], warnings: [] };
  }
}

async function validateComprehensionInner(judge: Judge, dir: string): Promise<Report> {
  const report: Report = { errors: [], warnings: [] };
  const fail = (m: string) => report.errors.push(m);
  let item;
  try {
    item = loadComprehensionItem(dir);
  } catch (e) {
    fail((e as Error).message);
    return report;
  }
  common(dir, report);
  const m = item.manifest;
  const lang = m.language;
  const lines = countLines(item.code);
  const files = Object.keys(item.code).length;
  if (lines < 120 && !process.env.SWEMOCK_VALIDATE_SMALL) fail(`the codebase is ${lines} lines; aim for 200–500`);
  else if (lines < 200 || lines > 500) report.warnings.push(`the codebase is ${lines} lines (the spec asks for 200–500)`);
  if (files > 5) fail(`${files} files; the spec allows 1–5`);

  const command = commandsFor(lang, m.commands)[0];
  if (!command) {
    fail("no test command: add commands to item.yaml (C++ items have no default)");
    return report;
  }
  const bugNames = new Map(m.bugs.map((b) => [b.id, `test_bug_${b.id.replace(/-/g, "_")}`]));
  for (const b of m.bugs) {
    if (!b.fix) fail(`${b.id}: needs a fix (an exact replacement) so the bug can be proven`);
    else if (!(bugNames.get(b.id)! in Object.fromEntries([...Object.values(item.bugTests).join("\n").matchAll(/def (test_\w+)/g)].map((x) => [x[1], 1])))) fail(`${b.id}: bugtests/ needs a test named ${bugNames.get(b.id)}`);
    const text = item.code[b.file]!;
    if (b.lines[1] > text.split("\n").length) fail(`${b.id}: lines ${b.lines.join("–")} are past the end of ${b.file}`);
    if (b.fix && b.fix.file === b.file && text.includes(b.fix.old)) {
      const at = lineOf(text, b.fix.old);
      if (at < b.lines[0] - 1 || at > b.lines[1] + 1) fail(`${b.id}: the fix starts at line ${at}, outside the planted range ${b.lines.join("–")}`);
    }
  }
  if (report.errors.length) return report;

  const base: FileMap = { ...item.code, ...item.tests };
  const shipping = await run(judge, lang, base, command);
  if (!allPass(shipping)) fail(`the shipping tests don't pass on the buggy code (they must, or the bugs would be obvious).\n${summary(shipping)}`);
  const buggy = await run(judge, lang, { ...base, ...item.bugTests }, command);
  const failing = failedNames(buggy);
  for (const [id, name] of bugNames) if (!failing.has(name)) fail(`${id}: ${name} passes on the buggy code, so it doesn't prove the bug`);
  for (const b of m.bugs) {
    const fixed = await run(judge, lang, { ...applyFix(item.code, b.fix!), ...item.tests, ...item.bugTests }, command);
    if (!fixed.tests || !(fixed.tests.find((t) => t.name === bugNames.get(b.id))?.status === "passed")) fail(`${b.id}: ${bugNames.get(b.id)} still fails after the fix.\n${summary(fixed)}`);
  }
  let all = item.code;
  for (const b of m.bugs) all = applyFix(all, b.fix!);
  const clean = await run(judge, lang, { ...all, ...item.tests, ...item.bugTests }, command);
  if (!allPass(clean)) fail(`with every fix applied, tests still fail.\n${summary(clean)}`);
  return report;
}

export async function validateReview(judge: Judge, dir: string): Promise<Report> {
  try {
    return await validateReviewInner(judge, dir);
  } catch (e) {
    return { errors: [(e as Error).message], warnings: [] };
  }
}

async function validateReviewInner(judge: Judge, dir: string): Promise<Report> {
  const report: Report = { errors: [], warnings: [] };
  const fail = (m: string) => report.errors.push(m);
  let item;
  try {
    item = loadReviewItem(dir);
  } catch (e) {
    fail((e as Error).message);
    return report;
  }
  common(dir, report);
  const m = item.manifest;
  const changed = Object.keys(item.head).filter((p) => item.head[p] !== item.base[p]);
  if (changed.length === 0) fail("head/ is identical to base/: the PR changes nothing");
  if (changed.length > 4) fail(`the PR changes ${changed.length} files; the spec allows 1–4`);
  const command = commandsFor(m.language, m.commands)[0];
  if (!command) return { errors: [...report.errors, "no test command"], warnings: [] };
  for (const i of m.issues) {
    if (!changed.includes(i.file)) fail(`${i.id}: ${i.file} isn't one of the changed files (${changed.join(", ")})`);
    if (i.lines[1] > item.head[i.file]!.split("\n").length) fail(`${i.id}: lines are past the end of ${i.file}`);
  }
  if (report.errors.length) return report;

  const shipped = { ...item.head, ...item.tests };
  const visible = await run(judge, m.language, shipped, command);
  if (!allPass(visible)) fail(`the tests that ship with the PR don't pass on it.\n${summary(visible)}`);
  const asIs = await run(judge, m.language, { ...shipped, ...item.hiddenTests }, command);
  if (m.decision === "approve") {
    if (!allPass(asIs)) fail(`the PR should be approvable, but the hidden tests fail on it.\n${summary(asIs)}`);
    if (m.issues.some((i) => i.severity !== "low")) fail("an approvable PR may only have low-severity nits");
  } else if (allPass(asIs)) {
    fail("the hidden tests pass on the PR as submitted; at least one seeded issue needs a failing test (a correctness bug), or use decision: approve");
  }
  let fixed = item.head;
  for (const i of m.issues) if (i.fix) fixed = applyFix(fixed, i.fix);
  const afterFix = await run(judge, m.language, { ...fixed, ...item.tests, ...item.hiddenTests }, command);
  if (m.decision !== "approve" && !allPass(afterFix)) fail(`with every fix applied, tests still fail.\n${summary(afterFix)}`);
  return report;
}

export async function validateExtension(judge: Judge, dir: string): Promise<Report> {
  try {
    return await validateExtensionInner(judge, dir);
  } catch (e) {
    return { errors: [(e as Error).message], warnings: [] };
  }
}

async function validateExtensionInner(judge: Judge, dir: string): Promise<Report> {
  const report: Report = { errors: [], warnings: [] };
  const fail = (m: string) => report.errors.push(m);
  let item;
  try {
    item = loadExtensionItem(dir);
  } catch (e) {
    fail((e as Error).message);
    return report;
  }
  common(dir, report);
  const m = item.manifest;
  const code = Object.fromEntries(Object.entries(item.repo).filter(([p]) => !p.startsWith("tests/")));
  const n = Object.keys(item.repo).length;
  if (n < 6 || n > 30) report.warnings.push(`${n} files in the repo; the spec asks for 8–20`);
  const lines = countLines(code);
  if (lines < 300 && !process.env.SWEMOCK_VALIDATE_SMALL) fail(`${lines} lines of code; aim for 500–2000`);
  else if (lines < 500) report.warnings.push(`${lines} lines of code (the spec asks for 500–2000)`);
  if (!/acceptance/.test(Object.values(item.hiddenTests).join("\n"))) fail("hidden tests need acceptance tests (names containing 'acceptance')");
  const command = commandsFor(m.language, m.commands)[0];
  if (!command) return { errors: [...report.errors, "no test command"], warnings: [] };
  if (report.errors.length) return report;

  const existing = await run(judge, m.language, item.repo, command);
  if (!allPass(existing)) fail(`the existing suite doesn't pass on the repo.\n${summary(existing)}`);
  const before = await run(judge, m.language, { ...item.repo, ...item.hiddenTests }, command);
  const acceptance = (before.tests ?? []).filter((t) => t.category === "acceptance");
  if (acceptance.length === 0 || acceptance.every((t) => t.status === "passed")) fail("the acceptance tests pass before any work is done");
  if ((before.tests ?? []).some((t) => t.category === "regression" && t.status !== "passed")) fail(`regression tests fail before any work is done.\n${summary(before)}`);
  const after = await run(judge, m.language, { ...item.repo, ...item.reference, ...item.hiddenTests }, command);
  if (!allPass(after)) fail(`the reference implementation doesn't pass everything.\n${summary(after)}`);
  return report;
}
