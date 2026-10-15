import "server-only";
import {
  LLD_RESULTS_PATH,
  isHiddenLldTest,
  type Language,
  type ProjectRunResult,
} from "@swemock/shared";
import type { FluencyCommand } from "@swemock/content";
import type { CommandResult, FluencyTestView, FluencyType, FindingView, SubmitResult } from "@/lib/fluency-types";
import { getFluency, getFluencyPrivate, type PublicOf } from "../content/fluency";
import { activePracticeSession, addEvent, endSession, getSession, sessionEvents, startSession, type SessionRow } from "../dsa/store";
import { ApiError } from "../http/errors";
import { settleInterview } from "../interview/engine";
import { runProject } from "../judge/client";
import { loadLldDrafts, saveLldDraft } from "../lld/store";
import { foldFindings } from "./findings";

type Files = Record<string, string>;
type AnyPub = PublicOf[FluencyType];

export interface Resolved {
  type: FluencyType;
  slug: string;
  itemId: string;
  pub: AnyPub;
  session: SessionRow;
}

/** The item's public files plus its shipping tests: where the candidate starts. */
export function startingFiles(type: FluencyType, pub: AnyPub): Files {
  if (type === "comprehension") return { ...(pub as PublicOf["comprehension"]).files, ...(pub as PublicOf["comprehension"]).tests };
  if (type === "review") return { ...(pub as PublicOf["review"]).head, ...(pub as PublicOf["review"]).tests };
  return { ...(pub as PublicOf["extension"]).files };
}

function requireItem(type: FluencyType, slug: string) {
  const item = getFluency(type, slug);
  if (!item) throw new ApiError(404, "That item doesn't exist.");
  return item;
}

/** Practice sessions start on first use; interview sessions are strict and enforce the clock. */
export function resolveSession(type: FluencyType, slug: string, sessionId: string | undefined, opts: { allowEnded?: boolean } = {}): Resolved {
  const item = requireItem(type, slug);
  let session = sessionId ? getSession(sessionId) : null;
  if (session?.mode === "interview") {
    session = settleInterview(session.id).session;
    if (session.itemId !== item.id) throw new ApiError(400, "That item isn't part of this interview.");
    if (session.status !== "active" && !opts.allowEnded) throw new ApiError(409, "This interview has ended.");
    return { type, slug, itemId: item.id, pub: item.pub, session };
  }
  if (!session || session.status !== "active" || session.itemId !== item.id) {
    session = activePracticeSession(item.id) ?? startSession({ itemId: item.id, mode: "practice", roundType: type });
  }
  return { type, slug, itemId: item.id, pub: item.pub, session };
}

const PATH = /^[\w-]+(?:\/[\w.-]+)*(?:\.[\w-]+)?$|^[\w.-]+$/;
const EDITABLE_NEW = /\.(py|cpp|hpp|h|md|txt|json)$/;

/** Keeps the files the candidate can legitimately send: the item's own paths and new files they created. */
export function sanitizeFiles(type: FluencyType, pub: AnyPub, sent: Files): Files {
  const base = startingFiles(type, pub);
  const out: Files = {};
  let total = 0;
  for (const [path, text] of Object.entries(sent)) {
    if (typeof text !== "string" || path.includes("..") || !PATH.test(path) || path.startsWith("tests/hidden") || path.startsWith(".results")) continue;
    if (!(path in base) && !EDITABLE_NEW.test(path)) continue;
    if (Object.keys(out).length >= 60 || text.length > 200_000 || (total += text.length) > 1_500_000) throw new ApiError(400, "That workspace is too large.");
    out[path] = text;
  }
  // Anything the candidate deleted from the starting set comes back: the exercise has fixed files.
  for (const [path, text] of Object.entries(base)) if (!(path in out)) out[path] = text;
  return out;
}

function commandOf(pub: AnyPub, id: string): FluencyCommand {
  const c = pub.commands.find((x) => x.id === id);
  if (!c) throw new ApiError(400, "That command isn't part of this exercise.");
  return c;
}

const CATEGORIES = [{ pattern: "acceptance", category: "acceptance" as const }, { pattern: ".", category: "regression" as const }];

function suite(language: Language, files: Files, command: FluencyCommand): Promise<ProjectRunResult> {
  return runProject({
    language,
    files,
    command: { kind: "shell", cmd: command.cmd },
    results: command.results ? { format: "junit", path: command.results } : { format: "junit", path: LLD_RESULTS_PATH },
    categories: CATEGORIES,
    timeoutMs: 120_000,
  });
}

const cap = (s: string) => (s.length > 8000 ? `${s.slice(0, 4000)}\n… (truncated) …\n${s.slice(-3500)}` : s);

export interface FluencyRequest {
  type: FluencyType;
  slug: string;
  files: Files;
  sessionId?: string;
}

/** Runs one of the manifest's commands on the candidate's files. Visible tests only. */
export async function runCommand(req: FluencyRequest & { commandId: string }): Promise<CommandResult> {
  const { pub, session, type } = resolveSession(req.type, req.slug, req.sessionId);
  const command = commandOf(pub, req.commandId);
  const files = sanitizeFiles(type, pub, req.files);
  const r = await suite(pub.language, files, command);
  const tests: FluencyTestView[] | null = r.tests
    ? r.tests.map((t) => ({ label: t.name, hidden: false, category: t.category, status: t.status, message: (t.message ?? "").slice(0, 1500) || null }))
    : null;
  const passed = tests?.filter((t) => t.status === "passed").length ?? 0;
  const result: CommandResult = {
    sessionId: session.id,
    commandId: req.commandId,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    stdout: cap(r.stdout),
    stderr: cap(r.stderr),
    tests,
    passed,
    total: tests?.length ?? 0,
  };
  addEvent(session.id, "run", { slug: req.slug, type, language: pub.language, commandId: req.commandId, files, verdict: tests ? (passed === tests.length && tests.length > 0 ? "accepted" : "wrong_answer") : r.exitCode === 0 ? "ran" : "runtime_error", passed, total: result.total, exitCode: r.exitCode });
  return result;
}

/** Extension and review: visible plus hidden tests (acceptance and regression), masked like LLD submissions. */
export async function submit(req: FluencyRequest): Promise<SubmitResult> {
  const { pub, session, type } = resolveSession(req.type, req.slug, req.sessionId);
  if (type === "comprehension") throw new ApiError(400, "There is nothing to submit in a code comprehension round.");
  const priv = getFluencyPrivate(type, req.slug)!;
  const hidden = (priv as { hiddenTests: Files }).hiddenTests;
  const files = sanitizeFiles(type, pub, req.files);
  const command = commandOf(pub, pub.commands[0]!.id);
  const r = await suite(pub.language, { ...files, ...hidden }, command);

  let tests: FluencyTestView[] = [];
  let buildError: string | null = null;
  if (r.tests) {
    let n = 0;
    tests = r.tests.map((t) => {
      const isHidden = isHiddenLldTest(t.classname);
      return { label: isHidden ? `Hidden test #${++n}` : t.name, hidden: isHidden, category: t.category, status: t.status, message: isHidden ? null : (t.message ?? "").slice(0, 1500) || null };
    });
  } else {
    const out = `${r.stderr}\n${r.stdout}`.trim();
    buildError = /tests[\\/]hidden/.test(out) ? "The tests couldn't be built or run against your code. Check names and signatures against the ticket." : out.split("\n").slice(-30).join("\n").slice(-3500) || "The tests didn't run.";
  }
  const counts: SubmitResult["counts"] = {};
  for (const t of tests) {
    const c = (counts[t.category] ??= { passed: 0, total: 0 });
    c.total++;
    if (t.status === "passed") c.passed++;
  }
  const passed = tests.filter((t) => t.status === "passed").length;
  const result: SubmitResult = { sessionId: session.id, tests, counts, passed, total: tests.length, buildError, timedOut: r.timedOut, solved: !buildError && !r.timedOut && tests.length > 0 && passed === tests.length };
  addEvent(session.id, "submit", { slug: req.slug, type, language: pub.language, files, verdict: result.solved ? "accepted" : buildError ? "compile_error" : "wrong_answer", passed, total: result.total, counts });
  return result;
}

const SNAPSHOT_EVERY_MS = 30_000;

export function saveWorkspace(req: FluencyRequest, now = Date.now()): void {
  const item = requireItem(req.type, req.slug);
  const files = sanitizeFiles(req.type, item.pub, req.files);
  const existing = req.sessionId ? getSession(req.sessionId) : null;
  let session: SessionRow | null = null;
  if (existing?.mode === "interview") {
    session = settleInterview(existing.id, now).session;
    if (session.status !== "active") throw new ApiError(409, "Time is up: this session has ended.");
    if (session.itemId !== item.id) throw new ApiError(400, "That item isn't part of this session.");
    saveLldDraft(item.id, item.pub.language, files, session.id, now);
  } else {
    saveLldDraft(item.id, item.pub.language, files, null, now);
    session = activePracticeSession(item.id);
  }
  if (session) {
    const last = sessionEvents(session.id, "code_snapshot").at(-1);
    if (!last || now - last.ts >= SNAPSHOT_EVERY_MS) addEvent(session.id, "code_snapshot", { slug: req.slug, language: item.pub.language, files }, now);
  }
}

/** Practice: end the attempt and see the results (the debrief). */
export function finishPractice(type: FluencyType, slug: string, sessionId: string | undefined): { sessionId: string } {
  const { session } = resolveSession(type, slug, sessionId);
  if (session.mode !== "practice") throw new ApiError(400, "End an interview from the interview page.");
  endSession(session.id, "ended");
  return { sessionId: session.id };
}

export interface FluencyPageData {
  pub: AnyPub;
  itemId: string;
  sessionId: string | null;
  drafts: Files | null;
  findings: FindingView[];
  summary: string;
  decision: { value: string; summary: string } | null;
}

export function loadFluencyPage(type: FluencyType, slug: string): FluencyPageData | null {
  const item = getFluency(type, slug);
  if (!item) return null;
  const session = activePracticeSession(item.id);
  const folded = session ? foldFindings(session.id) : null;
  return {
    pub: item.pub,
    itemId: item.id,
    sessionId: session?.id ?? null,
    drafts: loadLldDrafts(item.id, null)[item.pub.language] ?? null,
    findings: folded?.findings ?? [],
    summary: folded?.summary ?? "",
    decision: folded?.decision ?? null,
  };
}
