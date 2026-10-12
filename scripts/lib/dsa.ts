import fs from "node:fs";
import path from "node:path";
import {
  MAX_VISIBLE_TESTS,
  MIN_HIDDEN_TESTS,
  MIN_VISIBLE_TESTS,
  SLUG_RE,
  generatedTestSchema,
  loadDsaItem,
  type DsaMeta,
  type HiddenCase,
  type LoadedDsa,
  type TestKind,
} from "@swemock/content";
import {
  CODEGEN,
  validateExpected,
  validateTestInput,
  type DsaRunResult,
  type DsaTest,
  type Language,
} from "@swemock/shared";
import { z } from "zod";
import type { Judge } from "../../services/runner/src/judge";

const BATCH = 100;
const GEN_TIMEOUT_MS = 60_000;
const MAX_HIDDEN_BYTES = 8 * 1024 * 1024;

export interface Report {
  errors: string[];
  warnings: string[];
}

function sourceFor(item: LoadedDsa, language: Language, solution: "reference" | "brute"): string | null {
  if (solution === "brute") return item.brute;
  return item.references[language] ?? null;
}

/** Runs a solution over `tests` in batches the runner accepts, and concatenates the results. */
async function runSolution(
  judge: Judge,
  item: LoadedDsa,
  language: Language,
  code: string,
  tests: DsaTest[],
  opts: { captureFull?: boolean; useChecker?: boolean } = {},
): Promise<DsaRunResult> {
  const results: DsaRunResult[] = [];
  for (let i = 0; i < tests.length; i += BATCH) {
    results.push(
      await judge.runDsa({
        language,
        code,
        signature: item.manifest.signature,
        tests: tests.slice(i, i + BATCH),
        checker: item.checker,
        timeLimitMs: item.manifest.limits.time_ms,
        memoryLimitMb: item.manifest.limits.memory_mb,
        captureFull: opts.captureFull ?? false,
      }),
    );
  }
  const all = results.flatMap((r) => r.tests);
  const compile = results.find((r) => r.verdict === "compile_error");
  const worst = results.find((r) => r.verdict !== "accepted" && r.verdict !== "ran");
  const times = all.map((t) => t.timeMs).filter((t): t is number => t !== null);
  return {
    verdict: compile ? "compile_error" : (worst?.verdict ?? results[0]?.verdict ?? "accepted"),
    passed: all.filter((t) => t.verdict === "accepted").length,
    total: tests.length,
    compileOutput: compile?.compileOutput ?? null,
    tests: all,
    maxTimeMs: times.length ? Math.max(...times) : null,
    maxMemoryKb: null,
  };
}

function describeFailure(r: DsaRunResult, tests: { id: string }[]): string {
  if (r.verdict === "compile_error") return `compile error:\n${r.compileOutput}`;
  const bad = r.tests.find((t) => t.verdict !== "accepted" && t.verdict !== "ran");
  if (!bad) return r.verdict;
  const detail = [bad.message, bad.stderr.slice(0, 300)].filter(Boolean).join(" | ");
  return `test ${bad.id} (${tests.findIndex((t) => t.id === bad.id) + 1}/${tests.length}) → ${bad.verdict}${detail ? `: ${detail}` : ""}`;
}

async function runGenerator(judge: Judge, item: LoadedDsa): Promise<{ kind: TestKind; input: unknown }[]> {
  if (!item.generator) throw new Error("tests/gen.py is missing");
  const r = await judge.runProject({
    language: "python",
    files: { "gen.py": item.generator },
    command: { kind: "shell", cmd: "python3 gen.py > out.json" },
    collect: ["out.json"],
    timeoutMs: GEN_TIMEOUT_MS,
  });
  if (r.timedOut) throw new Error(`gen.py did not finish within ${GEN_TIMEOUT_MS / 1000}s`);
  if (r.exitCode !== 0) throw new Error(`gen.py failed (exit ${r.exitCode}):\n${r.stderr.slice(-1500)}`);
  const out = r.files["out.json"];
  if (!out) throw new Error("gen.py printed nothing");
  let json: unknown;
  try {
    json = JSON.parse(out);
  } catch {
    throw new Error("gen.py must print one JSON array to stdout");
  }
  const parsed = z.array(generatedTestSchema).safeParse(json);
  if (!parsed.success) throw new Error(`gen.py output: ${parsed.error.issues[0]?.message} at ${parsed.error.issues[0]?.path.join(".")}`);
  return parsed.data as { kind: TestKind; input: unknown }[];
}

function stable(v: unknown): string {
  return JSON.stringify(v);
}

// ---- gen ---------------------------------------------------------------------------------------------

/** Runs gen.py, computes expected outputs with the Python reference, times both references, writes tests/. */
export async function genDsa(judge: Judge, dir: string, log: (m: string) => void): Promise<void> {
  const item = loadDsaItem(dir);
  const sig = item.manifest.signature;
  const py = sourceFor(item, "python", "reference");
  const cpp = sourceFor(item, "cpp", "reference");
  if (!py || !cpp) throw new Error("solutions/reference.py and solutions/reference.cpp are both required");

  log("running tests/gen.py");
  const generated = await runGenerator(judge, item);
  for (const [i, t] of generated.entries()) {
    const err = validateTestInput(sig, t.input);
    if (err) throw new Error(`generated test ${i + 1}: ${err}`);
  }

  log(`computing expected outputs for ${generated.length} tests with the Python reference`);
  const inputs: DsaTest[] = generated.map((t, i) => ({ id: `h${i + 1}`, input: t.input }));
  const ran = await runSolution(judge, item, "python", py, inputs, { captureFull: true });
  if (ran.verdict !== "ran") throw new Error(`Python reference failed: ${describeFailure(ran, inputs)}`);

  const hidden: HiddenCase[] = generated.map((t, i) => {
    const expected: unknown = JSON.parse(ran.tests[i]!.actual!);
    const err = validateExpected(sig, t.input, expected);
    if (err) throw new Error(`test ${i + 1}: reference output ${err}`);
    return { id: `h${i + 1}`, kind: t.kind, input: t.input, expected };
  });

  log("checking the C++ reference and timing both");
  const withExpected: DsaTest[] = [...item.visible, ...hidden].map((t) => ({ id: t.id, input: t.input, expected: t.expected }));
  const cppRun = await runSolution(judge, item, "cpp", cpp, withExpected);
  if (cppRun.verdict !== "accepted") throw new Error(`C++ reference disagrees with the Python reference: ${describeFailure(cppRun, withExpected)}`);

  const meta: DsaMeta = {
    ref_time_ms: { python: round(ran.maxTimeMs ?? 0), cpp: round(cppRun.maxTimeMs ?? 0) },
    hidden_count: hidden.length,
  };

  const lines = hidden.map((h) => stable({ kind: h.kind, input: h.input, expected: h.expected }));
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "tests/hidden.json"), `[\n${lines.join(",\n")}\n]\n`);
  fs.writeFileSync(path.join(dir, "tests/meta.json"), JSON.stringify(meta, null, 2) + "\n");
  const kb = Math.round(Buffer.byteLength(lines.join("")) / 1024);
  log(`wrote tests/hidden.json (${hidden.length} tests, ${kb} KB) and tests/meta.json`);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---- validate -------------------------------------------------------------------------------------------

export async function validateDsa(judge: Judge, dir: string): Promise<Report> {
  const report: Report = { errors: [], warnings: [] };
  const fail = (m: string) => report.errors.push(m);
  const warn = (m: string) => report.warnings.push(m);
  const slug = path.basename(dir);

  let item: LoadedDsa;
  try {
    item = loadDsaItem(dir);
  } catch (e) {
    fail((e as Error).message);
    return report;
  }
  const m = item.manifest;
  const sig = m.signature;

  // -- static checks
  if (!SLUG_RE.test(slug)) fail(`folder name "${slug}" must be lowercase words separated by hyphens`);
  if (fs.readFileSync(path.join(dir, "problem.yaml"), "utf8").includes("SCAFFOLD")) {
    fail("problem.yaml still has the SCAFFOLD marker; finish the problem, then delete that line");
  }
  if (!/constraints/i.test(item.statementMd)) fail("statement.md needs a Constraints section");
  if (!/example/i.test(item.statementMd)) fail("statement.md needs an Examples section");
  for (const [label, re] of [
    ["intuition", /intuition/i],
    ["approach", /approach/i],
    ["complexity", /complexity/i],
    ["pitfalls or edge cases", /pitfall|edge case/i],
  ] as const) {
    if (!re.test(item.editorialMd)) fail(`editorial.md must cover: ${label}`);
  }
  if (new Set(m.hints).size !== m.hints.length) fail("hints must be four distinct levels");
  if (m.tle_guard && !item.brute) fail("tle_guard is true but solutions/brute.py is missing");
  if (!m.tle_guard && item.brute) warn("solutions/brute.py exists but tle_guard is false");
  if (!item.generator) fail("tests/gen.py is missing");
  if (!item.references.python) fail("solutions/reference.py is missing");
  if (!item.references.cpp) fail("solutions/reference.cpp is missing");

  if (item.visible.length < MIN_VISIBLE_TESTS || item.visible.length > MAX_VISIBLE_TESTS) {
    fail(`needs ${MIN_VISIBLE_TESTS}–${MAX_VISIBLE_TESTS} visible tests, found ${item.visible.length}`);
  }
  if (item.hidden.length < MIN_HIDDEN_TESTS) {
    fail(`needs at least ${MIN_HIDDEN_TESTS} hidden tests, found ${item.hidden.length}; run pnpm content:gen ${slug}`);
  }
  for (const kind of ["edge", "stress"] as const) {
    if (item.hidden.length && !item.hidden.some((t) => t.kind === kind)) fail(`hidden tests need at least one "${kind}" test`);
  }
  if (!item.meta) fail(`tests/meta.json is missing; run pnpm content:gen ${slug}`);
  else if (item.meta.hidden_count !== item.hidden.length) fail("tests/meta.json is stale; run pnpm content:gen");

  const hiddenBytes = Buffer.byteLength(JSON.stringify(item.hidden));
  if (hiddenBytes > MAX_HIDDEN_BYTES) fail(`hidden tests are ${Math.round(hiddenBytes / 1024)} KB; the limit is ${MAX_HIDDEN_BYTES / 1024} KB`);

  for (const t of [...item.visible, ...item.hidden]) {
    const err = validateTestInput(sig, t.input) ?? validateExpected(sig, t.input, t.expected);
    if (err) fail(`test ${t.id}: ${err}`);
  }
  if (report.errors.length) return report; // dynamic checks need well-formed data

  const all: DsaTest[] = [...item.visible, ...item.hidden].map((t) => ({ id: t.id, input: t.input, expected: t.expected }));

  // -- reference solutions pass every test
  const refRuns = await Promise.all(
    (["python", "cpp"] as const).map(async (language) => ({
      language,
      run: await runSolution(judge, item, language, item.references[language]!, all),
    })),
  );
  for (const { language, run } of refRuns) {
    if (run.verdict !== "accepted") fail(`${language} reference: ${describeFailure(run, all)}`);
    else if ((run.maxTimeMs ?? 0) > m.limits.time_ms * 0.6) {
      fail(`${language} reference's slowest test takes ${run.maxTimeMs} ms of the ${m.limits.time_ms} ms limit; a slower machine would time out`);
    } else if ((run.maxTimeMs ?? 0) > m.limits.time_ms * 0.35) {
      warn(`${language} reference's slowest test takes ${run.maxTimeMs} ms of the ${m.limits.time_ms} ms limit`);
    }
  }

  // -- brute force times out on the large tests, and is correct on the rest
  if (m.tle_guard && item.brute) {
    const small = all.filter((t) => !item.hidden.find((h) => h.id === t.id && h.kind === "stress"));
    const stress = all.filter((t) => item.hidden.find((h) => h.id === t.id && h.kind === "stress"));
    const [okRun, stressRun] = await Promise.all([
      runSolution(judge, item, "python", item.brute, small),
      runSolution(judge, item, "python", item.brute, stress),
    ]);
    if (okRun.verdict !== "accepted") fail(`brute.py is wrong on a small test: ${describeFailure(okRun, small)}`);
    else if ((okRun.maxTimeMs ?? 0) > m.limits.time_ms * 0.5) {
      // A slower machine (CI, another laptop) would push this over the limit and fail validation at random.
      fail(`brute.py's slowest small test takes ${okRun.maxTimeMs} ms of the ${m.limits.time_ms} ms limit; shrink that test or mark it "stress"`);
    } else if ((okRun.maxTimeMs ?? 0) > m.limits.time_ms * 0.3) {
      warn(`brute.py's slowest small test takes ${okRun.maxTimeMs} ms of the ${m.limits.time_ms} ms limit`);
    }
    const bad = stressRun.tests.filter((t) => t.verdict !== "accepted" && t.verdict !== "time_limit_exceeded");
    if (bad.length) fail(`brute.py fails a stress test for a reason other than time: ${bad[0]!.id} → ${bad[0]!.verdict}`);
    if (!stressRun.tests.some((t) => t.verdict === "time_limit_exceeded")) {
      fail("tle_guard: brute.py did not time out on any stress test; make the stress tests larger");
    }
  }

  // -- the generator is reproducible
  try {
    const regenerated = await runGenerator(judge, item);
    const same =
      regenerated.length === item.hidden.length &&
      regenerated.every((t, i) => t.kind === item.hidden[i]!.kind && stable(t.input) === stable(item.hidden[i]!.input));
    if (!same) fail("tests/gen.py is not reproducible, or hidden.json is stale; use a fixed seed and rerun pnpm content:gen");
  } catch (e) {
    fail((e as Error).message);
  }

  // -- generated stubs are valid code in each language
  for (const language of ["python", "cpp"] as const) {
    const stub = CODEGEN[language].stub(sig);
    const r = await judge.runDsa({
      language,
      code: stub,
      signature: sig,
      tests: [{ id: "stub", input: item.visible[0]!.input }],
      timeLimitMs: 2000,
    });
    if (r.verdict === "compile_error") fail(`the generated ${language} stub does not compile:\n${r.compileOutput}`);
  }

  return report;
}
