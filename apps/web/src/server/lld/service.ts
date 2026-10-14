import "server-only";
import {
  LLD_CATEGORIES,
  LLD_RESULTS_PATH,
  LLD_TEST_COMMAND,
  declaredLldTests,
  isHiddenLldTest,
  type Language,
  type LldCategory,
  type ProjectRunResult,
} from "@swemock/shared";
import type { LldPublic } from "@swemock/content";
import type { CategoryCounts, LldFileRunResponse, LldRevealPayload, LldRunResponse, MaskedLldTest } from "@/lib/lld-types";
import { getLld, getLldPrivate } from "../content/lld";
import { problemStatuses } from "../content/repo";
import { recordAttempt } from "../dsa/srs";
import { activePracticeSession, addEvent, endSession, getSession, sessionEvents, startSession, type SessionRow } from "../dsa/store";
import { ApiError } from "../http/errors";
import { diffStats } from "../interview/diff";
import { settleInterview } from "../interview/engine";
import { runProject } from "../judge/client";
import { loadLldDrafts, recordLldSubmission, saveLldDraft } from "./store";

type Files = Record<string, string>;

interface Resolved {
  problem: { id: string; pub: LldPublic };
  session: SessionRow;
}

function requireProblem(slug: string) {
  const p = getLld(slug);
  if (!p) throw new ApiError(404, "That problem doesn't exist.");
  return p;
}

/** Practice sessions are created on first use; interview sessions are strict and enforce the clock. */
function resolveSession(slug: string, sessionId: string | undefined): Resolved {
  const problem = requireProblem(slug);
  let session = sessionId ? getSession(sessionId) : null;
  if (session?.mode === "interview") {
    session = settleInterview(session.id).session;
    if (session.itemId !== problem.id) throw new ApiError(400, "That problem isn't part of this interview.");
    if (session.status !== "active") throw new ApiError(409, "This interview has ended.");
    return { problem, session };
  }
  if (!session || session.status !== "active" || session.itemId !== problem.id) {
    session = activePracticeSession(problem.id) ?? startSession({ itemId: problem.id, mode: "practice", roundType: "lld" });
  }
  return { problem, session };
}

export const changeIntroduced = (sessionId: string): boolean => sessionEvents(sessionId, "requirement_change").length > 0;

/** Only the files the manifest lists are editable; anything else the client sends is ignored. */
function userFiles(pub: LldPublic, language: Language, sent: Files): Files {
  const spec = pub.languages[language];
  if (!spec) throw new ApiError(400, "That problem isn't available in this language.");
  const out: Files = {};
  for (const f of spec.files) out[f.path] = typeof sent[f.path] === "string" ? sent[f.path]! : f.content;
  return out;
}

function editsOf(pub: LldPublic, language: Language, files: Files): LldRunResponse["edits"] {
  const out: LldRunResponse["edits"] = {};
  for (const f of pub.languages[language]!.files) {
    if (f.role !== "provided") continue;
    const s = diffStats(f.content, files[f.path] ?? f.content);
    if (s.added || s.removed) out[f.path] = s;
  }
  return out;
}

async function suite(language: Language, files: Files): Promise<ProjectRunResult> {
  return runProject({
    language,
    files,
    command: { kind: "shell", cmd: LLD_TEST_COMMAND[language] },
    results: { format: "junit", path: LLD_RESULTS_PATH },
    categories: LLD_CATEGORIES,
    timeoutMs: 120_000,
  });
}

/** Compiler and import errors can quote hidden test code; show them only when no hidden file is involved. */
function safeBuildOutput(r: ProjectRunResult): string {
  const out = `${r.stderr}\n${r.stdout}`.trim();
  if (/tests[\\/](hidden|extension)/.test(out)) {
    return "A hidden test couldn't be built against your code. Usually something a test needs is missing or named differently: check class, method, and header names against the spec.";
  }
  return out.split("\n").slice(-40).join("\n").slice(-4000);
}

interface Round {
  tests: MaskedLldTest[];
  buildError: string | null;
  timedOut: boolean;
  durationMs: number;
}

/** Turns one judge run into masked test rows. `declared` stands in for tests that never ran (a build error). */
function mask(r: ProjectRunResult, declared: { name: string; category: LldCategory | null; hidden: boolean }[], counter: { n: number }): Round {
  if (!r.tests) {
    const buildError = r.timedOut ? null : safeBuildOutput(r) || "The tests didn't run.";
    return {
      buildError,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      tests: declared.map((d) => ({
        label: d.hidden ? `Hidden test #${++counter.n}` : d.name,
        hidden: d.hidden,
        category: d.category ?? "core",
        status: "error",
        message: d.hidden ? null : "Not run: the code didn't build.",
      })),
    };
  }
  return {
    buildError: null,
    timedOut: r.timedOut,
    durationMs: r.durationMs,
    tests: r.tests.map((t) => {
      const hidden = isHiddenLldTest(t.classname);
      return {
        label: hidden ? `Hidden test #${++counter.n}` : t.name,
        hidden,
        category: t.category as LldCategory,
        status: t.status,
        message: hidden ? null : (t.message ?? "").slice(0, 2000) || null,
      };
    }),
  };
}

function countsOf(tests: MaskedLldTest[]): CategoryCounts {
  const counts: CategoryCounts = { core: { passed: 0, total: 0 }, edge: { passed: 0, total: 0 }, extension: { passed: 0, total: 0 } };
  for (const t of tests) {
    counts[t.category].total++;
    if (t.status === "passed") counts[t.category].passed++;
  }
  return counts;
}

export interface LldRequest {
  slug: string;
  language: Language;
  files: Files;
  sessionId?: string;
}

async function execute(req: LldRequest, kind: "run" | "submit"): Promise<LldRunResponse> {
  const { problem, session } = resolveSession(req.slug, req.sessionId);
  const { pub } = problem;
  const priv = getLldPrivate(req.slug)!;
  const lang = priv.languages[req.language];
  const spec = pub.languages[req.language];
  if (!lang || !spec) throw new ApiError(400, "That problem isn't available in this language.");
  const files = userFiles(pub, req.language, req.files);
  const base = { ...lang.support, ...files };

  const extension = kind === "submit" && changeIntroduced(session.id);
  const visible = spec.visibleTests;
  const main = kind === "run" ? visible : { ...visible, ...lang.hidden };
  const mark = (set: Files, hidden: boolean) => declaredLldTests(req.language, set).map((d) => ({ ...d, hidden }));
  const mainDeclared = [...mark(visible, false), ...(kind === "submit" ? mark(lang.hidden, true) : [])];

  const counter = { n: 0 };
  const first = mask(await suite(req.language, { ...base, ...main }), mainDeclared, counter);
  let rounds = [first];
  if (extension) rounds = [first, mask(await suite(req.language, { ...base, ...lang.extension }), mark(lang.extension, true), counter)];

  const tests = rounds.flatMap((r) => r.tests);
  const counts = countsOf(tests);
  const passed = tests.filter((t) => t.status === "passed").length;
  const solved =
    kind === "submit" && !first.buildError && !first.timedOut && tests.filter((t) => t.category !== "extension").every((t) => t.status === "passed") && tests.some((t) => t.category !== "extension");
  const response: LldRunResponse = {
    sessionId: session.id,
    kind,
    buildError: rounds.map((r) => r.buildError).find(Boolean) ?? null,
    timedOut: rounds.some((r) => r.timedOut),
    tests,
    counts,
    passed,
    total: tests.length,
    extensionIncluded: extension,
    solved,
    edits: editsOf(pub, req.language, files),
    durationMs: rounds.reduce((n, r) => n + r.durationMs, 0),
  };

  recordLldSubmission({ sessionId: session.id, itemId: problem.id, language: req.language, response });
  addEvent(session.id, kind, {
    slug: req.slug,
    language: req.language,
    files,
    verdict: solved ? "accepted" : response.buildError ? "compile_error" : "wrong_answer",
    passed,
    total: response.total,
    counts,
    extension,
    edits: response.edits,
  });
  if (solved && session.mode === "practice" && sessionEvents<{ verdict: string }>(session.id, "submit").filter((e) => e.payload.verdict === "accepted").length === 1) {
    const helped = sessionEvents(session.id, "hint").length > 0;
    const wrong = sessionEvents<{ verdict: string }>(session.id, "submit").filter((e) => e.payload.verdict !== "accepted").length;
    recordAttempt(problem.id, helped || wrong >= 3 ? "needed-help" : "clean");
  }
  return response;
}

/** Run: the visible tests only. Nothing hidden is involved. */
export const runLld = (req: LldRequest) => execute(req, "run");
/** Submit: visible and hidden tests, plus the extension tests once the requirement change is out. */
export const submitLld = (req: LldRequest) => execute(req, "submit");

/** "Run current file": the file as a program, no tests. */
export async function runLldFile(req: LldRequest & { path: string }): Promise<LldFileRunResponse> {
  const { problem, session } = resolveSession(req.slug, req.sessionId);
  const files = userFiles(problem.pub, req.language, req.files);
  const lang = getLldPrivate(req.slug)!.languages[req.language]!;
  if (!(req.path in files)) throw new ApiError(400, "Pick one of the editor files to run.");
  const r = await runProject({ language: req.language, files: { ...lang.support, ...files }, command: { kind: "runFile", path: req.path }, timeoutMs: 20_000 });
  return { sessionId: session.id, exitCode: r.exitCode, timedOut: r.timedOut, stdout: r.stdout, stderr: r.stderr };
}

// ---- autosave, hints, reveal ----------------------------------------------------------------------

const SNAPSHOT_EVERY_MS = 30_000;

export function saveLld(req: LldRequest, now = Date.now()): void {
  const problem = requireProblem(req.slug);
  const files = userFiles(problem.pub, req.language, req.files);
  const existing = req.sessionId ? getSession(req.sessionId) : null;
  let session: SessionRow | null = null;
  if (existing?.mode === "interview") {
    session = settleInterview(existing.id, now).session;
    if (session.status !== "active") throw new ApiError(409, "Time is up: this session has ended.");
    if (session.itemId !== problem.id) throw new ApiError(400, "That problem isn't part of this session.");
    saveLldDraft(problem.id, req.language, files, session.id, now);
  } else {
    saveLldDraft(problem.id, req.language, files, null, now);
    session = activePracticeSession(problem.id);
  }
  if (session) {
    const last = sessionEvents(session.id, "code_snapshot").at(-1);
    if (!last || now - last.ts >= SNAPSHOT_EVERY_MS) addEvent(session.id, "code_snapshot", { slug: req.slug, language: req.language, files }, now);
  }
}

function revealed(session: SessionRow): Set<number> {
  return new Set(sessionEvents<{ level: number }>(session.id, "hint").map((e) => e.payload.level));
}

const solvedBefore = (itemId: string) => problemStatuses().get(itemId) === "solved";

export function revealLldHint(req: { slug: string; level: number; sessionId?: string }): { sessionId: string; level: number; text: string } {
  const { problem, session } = resolveSession(req.slug, req.sessionId);
  const priv = getLldPrivate(req.slug)!;
  if (req.level < 1 || req.level > priv.hints.length) throw new ApiError(400, "No such hint level.");
  const seen = revealed(session);
  if (!seen.has(req.level)) {
    if (req.level > 1 && !seen.has(req.level - 1) && !solvedBefore(problem.id)) throw new ApiError(409, `Reveal hint ${req.level - 1} first.`);
    addEvent(session.id, "hint", { slug: req.slug, level: req.level, penalized: session.mode === "interview" });
  }
  return { sessionId: session.id, level: req.level, text: priv.hints[req.level - 1]! };
}

export function revealPayload(slug: string): LldRevealPayload {
  const priv = getLldPrivate(slug)!;
  return {
    designMd: priv.designMd,
    diagram: priv.diagram,
    references: Object.fromEntries(Object.entries(priv.languages).map(([l, v]) => [l, v!.reference])),
  };
}

/** Level 5: design notes, diagram, and the reference implementation. Needs the four hints, or a solve. */
export function revealLldDesign(req: { slug: string; sessionId?: string }): LldRevealPayload & { sessionId: string } {
  const { problem, session } = resolveSession(req.slug, req.sessionId);
  if (session.mode === "interview") throw new ApiError(403, "The reference is shown in the debrief, after the interview.");
  const priv = getLldPrivate(req.slug)!;
  const seen = revealed(session);
  const level = priv.hints.length + 1;
  if (!seen.has(level)) {
    if (!priv.hints.every((_, i) => seen.has(i + 1)) && !solvedBefore(problem.id)) throw new ApiError(409, "Reveal all four hints first, or give up to see the reference.");
    addEvent(session.id, "hint", { slug: req.slug, level });
  }
  return { sessionId: session.id, ...revealPayload(req.slug) };
}

export function giveUpLld(req: { slug: string; sessionId?: string }): LldRevealPayload {
  const { problem, session } = resolveSession(req.slug, req.sessionId);
  if (session.mode === "interview") throw new ApiError(403, "End the interview to see the reference in the debrief.");
  const priv = getLldPrivate(req.slug)!;
  addEvent(session.id, "hint", { slug: req.slug, level: priv.hints.length + 1, gaveUp: true });
  recordAttempt(problem.id, "gave-up");
  endSession(session.id, "abandoned");
  return revealPayload(req.slug);
}

/** Practice: introduce the authored requirement change on request, which unlocks the extension tests. */
export function introduceChange(req: { slug: string; sessionId?: string }): { sessionId: string; changeMd: string } {
  const { session } = resolveSession(req.slug, req.sessionId);
  const priv = getLldPrivate(req.slug)!;
  if (!changeIntroduced(session.id)) addEvent(session.id, "requirement_change", { slug: req.slug, source: "practice" });
  return { sessionId: session.id, changeMd: priv.changeMd };
}

// ---- page data -----------------------------------------------------------------------------------------

export interface LldPageData {
  pub: LldPublic;
  itemId: string;
  solved: boolean;
  sessionId: string | null;
  drafts: Partial<Record<Language, Files>>;
  revealedHints: { level: number; text: string }[];
  reveal: LldRevealPayload | null;
  change: string | null;
}

export function loadLldPage(slug: string): LldPageData | null {
  const problem = getLld(slug);
  if (!problem) return null;
  const priv = getLldPrivate(slug)!;
  const session = activePracticeSession(problem.id);
  const seen = session ? revealed(session) : new Set<number>();
  return {
    pub: problem.pub,
    itemId: problem.id,
    solved: problemStatuses().get(problem.id) === "solved",
    sessionId: session?.id ?? null,
    drafts: loadLldDrafts(problem.id, null),
    revealedHints: priv.hints.map((text, i) => ({ level: i + 1, text })).filter((h) => seen.has(h.level)),
    reveal: seen.has(priv.hints.length + 1) ? revealPayload(slug) : null,
    change: session && changeIntroduced(session.id) ? priv.changeMd : null,
  };
}
