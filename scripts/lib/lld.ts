import fs from "node:fs";
import path from "node:path";
import { LLD_CATEGORIES, LLD_RESULTS_PATH, LLD_TEST_COMMAND, declaredLldTests, isHiddenLldTest, LANGUAGES, type Language, type ProjectRunResult } from "@swemock/shared";
import { SLUG_RE, loadLldItem, type FileMap, type LoadedLld } from "@swemock/content";
import type { Judge } from "../../services/runner/src/judge";
import type { Report } from "./questions";

async function runSuite(judge: Judge, lang: Language, files: FileMap): Promise<ProjectRunResult> {
  return judge.runProject({
    language: lang,
    files,
    command: { kind: "shell", cmd: LLD_TEST_COMMAND[lang] },
    results: { format: "junit", path: LLD_RESULTS_PATH },
    categories: LLD_CATEGORIES,
    timeoutMs: 120_000,
  });
}

export async function validateLld(judge: Judge, dir: string): Promise<Report> {
  const report: Report = { errors: [], warnings: [] };
  const fail = (m: string) => report.errors.push(m);
  const warn = (m: string) => report.warnings.push(m);
  const slug = path.basename(dir);

  let item: LoadedLld;
  try {
    item = loadLldItem(dir);
  } catch (e) {
    fail((e as Error).message);
    return report;
  }
  const m = item.manifest;
  if (!SLUG_RE.test(slug)) fail(`folder name "${slug}" must be lowercase words separated by hyphens`);
  if (fs.readFileSync(path.join(dir, "problem.yaml"), "utf8").includes("SCAFFOLD")) fail("problem.yaml still has the SCAFFOLD marker; finish the problem, then delete that line");
  if (item.specMd.split(/\s+/).length < 60) fail("spec.md is too short to specify the API");
  if (!/^\s*classDiagram/m.test(item.diagram)) fail("diagram.mmd must be a Mermaid classDiagram");
  if (new Set(m.hints).size !== m.hints.length) fail("hints must be four distinct levels");
  if (item.changeMd.split(/\s+/).length < 12) fail("change.md should describe the requirement change in a few sentences");

  const languages = LANGUAGES.filter((l) => item.languages[l]);
  for (const lang of languages) {
    const files = item.languages[lang]!;
    const tag = `${lang}:`;
    const support = lang === "python" ? "conftest.py" : "doctest_main.cpp";
    if (!(support in files.support)) fail(`${tag} support/${support} is missing (copy it from the scaffold)`);
    for (const f of m.languages[lang]!.files) if (f.role === "solution" && !(f.path in files.reference)) fail(`${tag} reference/${f.path} is missing`);

    // Names must carry their category, and each folder may only hold its own kind.
    const visible = declaredLldTests(lang, files.tests.visible);
    const hidden = declaredLldTests(lang, files.tests.hidden);
    const ext = declaredLldTests(lang, files.tests.extension);
    for (const [where, names] of [["visible", visible], ["hidden", hidden], ["extension", ext]] as const) {
      for (const { name: n, category: c } of names) {
        if (!c) fail(`${tag} test "${n}" must be named core/edge/extension (test_core_…, "core: …")`);
        else if (where === "extension" && c !== "extension") fail(`${tag} "${n}" is in tests/extension but is not an extension test`);
        else if (where !== "extension" && c === "extension") fail(`${tag} "${n}" is an extension test; put it in tests/extension`);
      }
    }
    if (visible.length < 3) fail(`${tag} needs at least 3 visible tests (found ${visible.length})`);
    if (hidden.filter((t) => t.category === "core").length < 2) fail(`${tag} needs at least 2 hidden core tests`);
    if (hidden.filter((t) => t.category === "edge").length < 2) fail(`${tag} needs at least 2 hidden edge tests`);
    if (ext.length < 3) fail(`${tag} needs at least 3 extension tests (found ${ext.length})`);
  }
  if (report.errors.length) return report;

  for (const lang of languages) {
    const files = item.languages[lang]!;
    const base = { ...files.support, ...files.starter };
    const main = { ...files.tests.visible, ...files.tests.hidden };
    const expectedMain = declaredLldTests(lang, main).length;
    const expectedExt = declaredLldTests(lang, files.tests.extension).length;

    // The reference passes everything. Extension tests run apart from the rest, as the app runs them,
    // so a candidate who hasn't added the new API yet still gets their core results.
    const refMain = await runSuite(judge, lang, { ...base, ...files.reference, ...main });
    const refExt = await runSuite(judge, lang, { ...base, ...files.reference, ...files.tests.extension });
    for (const [label, r, want] of [["core and edge", refMain, expectedMain], ["extension", refExt, expectedExt]] as const) {
      describe(lang, label, r, fail);
      if (!r.tests || r.exitCode !== 0 || r.tests.some((t) => t.status !== "passed")) fail(`${lang}: the reference doesn't pass every ${label} test.\n${summary(r)}`);
      else if (r.tests.length !== want) fail(`${lang}: ran ${r.tests.length} ${label} tests but the files declare ${want}`);
      else if (r.durationMs > 60_000) warn(`${lang}: the ${label} suite takes ${Math.round(r.durationMs / 1000)} s`);
    }
    if (refMain.tests) {
      const hiddenSeen = refMain.tests.filter((t) => isHiddenLldTest(t.classname)).length;
      const hiddenWant = declaredLldTests(lang, files.tests.hidden).length;
      if (hiddenSeen !== hiddenWant) fail(`${lang}: ${hiddenWant} hidden tests declared but ${hiddenSeen} recognized as hidden by classname (see isHiddenLldTest)`);
      const cats = new Set(refMain.tests.map((t) => t.category));
      if (!cats.has("core") || !cats.has("edge")) fail(`${lang}: results lack a core or edge category (check test names)`);
    }

    // The starter runs (imports or compiles) and doesn't pass.
    const stub = await runSuite(judge, lang, { ...base, ...main });
    if (stub.timedOut) fail(`${lang}: the starter code times out`);
    else if (!stub.tests) fail(`${lang}: the starter code doesn't compile or import cleanly, so no tests ran.\n${summary(stub)}`);
    else if (stub.tests.every((t) => t.status === "passed")) fail(`${lang}: the starter code already passes every test`);
    const stubExt = await runSuite(judge, lang, { ...base, ...files.tests.extension });
    if (stubExt.tests && stubExt.tests.every((t) => t.status === "passed")) fail(`${lang}: the starter code already passes the extension tests`);
  }
  return report;
}

function describe(lang: string, what: string, r: ProjectRunResult, fail: (m: string) => void): void {
  if (r.timedOut) fail(`${lang}: ${what} timed out`);
  if (r.oomKilled) fail(`${lang}: ${what} ran out of memory`);
}

function summary(r: ProjectRunResult): string {
  const failed = (r.tests ?? []).filter((t) => t.status !== "passed").slice(0, 5).map((t) => `  ${t.classname}.${t.name}: ${t.message?.split("\n")[0] ?? t.status}`);
  const out = (r.stderr || r.stdout).trim().split("\n").slice(-12).join("\n");
  const needsOutput = !failed.length || (r.tests ?? []).some((t) => t.status !== "passed" && /collection failure/.test(t.message ?? ""));
  return [failed.join("\n"), needsOutput ? out : ""].filter(Boolean).join("\n");
}
