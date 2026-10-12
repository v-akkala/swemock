import "server-only";
import {
  validateTestInput,
  type DsaTest,
  type Language,
} from "@swemock/shared";
import type { DsaPublic } from "@swemock/content";
import type { EditorialPayload, HintPayload, RunResponse } from "@/lib/dsa-types";
import { getDsa, getDsaPrivate, problemStatuses } from "../content/repo";
import { ApiError } from "../http/errors";
import { runDsa } from "../judge/client";
import { maskTests, rateEfficiency, type CaseInfo } from "./mask";
import { onAccepted, settleInterview } from "../interview/engine";
import { parseState, settleOa } from "./oa";
import { recordAttempt } from "./srs";
import {
  activePracticeSession,
  addEvent,
  endSession,
  getSession,
  recordSubmission,
  saveDraft,
  sessionEvents,
  startSession,
  type SessionRow,
} from "./store";

interface Resolved {
  problem: { id: string; pub: DsaPublic };
  session: SessionRow;
}

function requireProblem(slug: string) {
  const problem = getDsa(slug);
  if (!problem) throw new ApiError(404, "That problem doesn't exist.");
  return problem;
}

/**
 * Finds the session a request belongs to. Practice sessions are created on first use and replaced
 * silently if the client holds a stale one; OA sessions are strict and enforce the deadline.
 */
function resolveSession(slug: string, sessionId: string | undefined): Resolved {
  const problem = requireProblem(slug);
  let session = sessionId ? getSession(sessionId) : null;

  if (session?.mode === "oa") {
    session = settleOa(session);
    if (!parseState(session).slugs.includes(slug)) throw new ApiError(400, "That problem isn't part of this assessment.");
    if (session.status !== "active") throw new ApiError(409, "Time is up: this assessment has ended.");
    return { problem, session };
  }

  if (session?.mode === "interview") {
    session = settleInterview(session.id).session;
    if (session.itemId !== problem.id) throw new ApiError(400, "That problem isn't part of this interview.");
    if (session.status !== "active") throw new ApiError(409, "This interview has ended.");
    return { problem, session };
  }

  if (!session || session.status !== "active" || session.itemId !== problem.id) {
    session = activePracticeSession(problem.id) ?? startSession({ itemId: problem.id, mode: "practice" });
  }
  return { problem, session };
}

function parseCustomInput(sig: DsaPublic["signature"], text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Custom input must be valid JSON.");
  }
  const err = validateTestInput(sig, value);
  if (err) throw new ApiError(400, `Custom input: ${err}`);
  return value;
}

export interface CodeRequest {
  slug: string;
  language: Language;
  code: string;
  sessionId?: string;
  customInput?: string;
}

/** Run: the visible samples plus optional custom input. Nothing hidden is involved. */
export async function runCode(req: CodeRequest): Promise<RunResponse> {
  const { problem, session } = resolveSession(req.slug, req.sessionId);
  const { pub } = problem;
  const priv = getDsaPrivate(req.slug);
  if (!priv) throw new ApiError(404, "That problem doesn't exist.");

  const cases = new Map<string, CaseInfo>();
  const tests: DsaTest[] = pub.visibleTests.map((t, i) => {
    cases.set(t.id, { id: t.id, hidden: false, label: `Sample ${i + 1}`, kind: null, input: t.input, expected: t.expected });
    return { id: t.id, input: t.input, expected: t.expected };
  });
  if (req.customInput?.trim()) {
    const input = parseCustomInput(pub.signature, req.customInput);
    cases.set("custom", { id: "custom", hidden: false, label: "Custom input", kind: null, input });
    tests.push({ id: "custom", input });
  }

  const result = await runDsa({
    language: req.language,
    code: req.code,
    signature: pub.signature,
    tests,
    checker: priv.checker,
    timeLimitMs: pub.limits.timeMs,
    memoryLimitMb: pub.limits.memoryMb,
  });

  const response: RunResponse = {
    sessionId: session.id,
    kind: "run",
    verdict: result.verdict,
    passed: result.passed,
    total: result.total,
    compileOutput: result.compileOutput,
    tests: maskTests(result, cases),
    maxTimeMs: result.maxTimeMs,
    maxMemoryKb: result.maxMemoryKb,
  };
  recordSubmission({ sessionId: session.id, itemId: problem.id, language: req.language, response });
  addEvent(session.id, "run", {
    slug: req.slug,
    language: req.language,
    code: req.code,
    verdict: response.verdict,
    passed: response.passed,
    total: response.total,
    custom: Boolean(req.customInput?.trim()),
  });
  return response;
}

/** Submit: visible and hidden tests. Hidden details are masked before anything leaves this function. */
export async function submitCode(req: CodeRequest): Promise<RunResponse> {
  const { problem, session } = resolveSession(req.slug, req.sessionId);
  const { pub } = problem;
  const priv = getDsaPrivate(req.slug);
  if (!priv) throw new ApiError(404, "That problem doesn't exist.");

  const cases = new Map<string, CaseInfo>();
  const tests: DsaTest[] = [];
  pub.visibleTests.forEach((t, i) => {
    cases.set(t.id, { id: t.id, hidden: false, label: `Sample ${i + 1}`, kind: null, input: t.input, expected: t.expected });
    tests.push({ id: t.id, input: t.input, expected: t.expected });
  });
  priv.hiddenTests.forEach((t, i) => {
    cases.set(t.id, { id: t.id, hidden: true, label: `Hidden test #${i + 1}`, kind: t.kind });
    tests.push({ id: t.id, input: t.input, expected: t.expected });
  });

  // OA and interviews run every test: partial credit and scoring need the share passed.
  const isOa = session.mode !== "practice";
  const result = await runDsa({
    language: req.language,
    code: req.code,
    signature: pub.signature,
    tests,
    checker: priv.checker,
    timeLimitMs: pub.limits.timeMs,
    memoryLimitMb: pub.limits.memoryMb,
    // Practice stops at the first failure (faster feedback); an OA needs every test for partial credit.
    stopOnFirstFailure: !isOa,
  });

  const solved = result.verdict === "accepted";
  const refMs = priv.meta?.ref_time_ms[req.language];
  const response: RunResponse = {
    sessionId: session.id,
    kind: "submit",
    verdict: result.verdict,
    passed: result.passed,
    total: result.total,
    compileOutput: result.compileOutput,
    tests: maskTests(result, cases),
    maxTimeMs: result.maxTimeMs,
    maxMemoryKb: result.maxMemoryKb,
    solved,
    efficiency:
      solved && result.maxTimeMs !== null && refMs !== undefined
        ? { rating: rateEfficiency(result.maxTimeMs, refMs), userMs: result.maxTimeMs, referenceMs: refMs }
        : null,
  };

  recordSubmission({ sessionId: session.id, itemId: problem.id, language: req.language, response });
  addEvent(session.id, "submit", {
    slug: req.slug,
    language: req.language,
    code: req.code,
    verdict: response.verdict,
    passed: response.passed,
    total: response.total,
    efficiency: response.efficiency?.rating ?? null,
  });

  if (solved && session.mode === "interview") onAccepted(session.id);
  if (solved && session.mode === "practice") {
    // Solving ends the practice session. Needing help (hints, the editorial, or several wrong tries)
    // puts the problem on the spaced-repetition schedule; a clean solve advances an existing card.
    const helped = sessionEvents(session.id, "hint").length > 0;
    const wrong = sessionEvents<{ verdict: string }>(session.id, "submit").filter((e) => e.payload.verdict !== "accepted").length;
    recordAttempt(problem.id, helped || wrong >= 3 ? "needed-help" : "clean");
    endSession(session.id, "ended");
  }
  return response;
}

// ---- hints, editorial, giving up -----------------------------------------------------------------

const SNAPSHOT_EVERY_MS = 30_000;

/** Autosave. Also logs a code snapshot for the session replay, at most every 30 seconds. */
export function saveCode(req: { slug: string; language: Language; code: string; sessionId?: string }, now = Date.now()): void {
  const problem = requireProblem(req.slug);
  const existing = req.sessionId ? getSession(req.sessionId) : null;
  if (existing?.mode === "oa" || existing?.mode === "interview") {
    const timed = existing.mode === "oa" ? settleOa(existing, now) : settleInterview(existing.id, now).session;
    if (timed.status !== "active") throw new ApiError(409, "Time is up: this session has ended.");
    if (timed.itemId && timed.itemId !== problem.id) throw new ApiError(400, "That problem isn't part of this session.");
    saveDraft(problem.id, req.language, req.code, timed.id, now);
    snapshot(timed.id, req.slug, req.language, req.code, now);
    return;
  }
  saveDraft(problem.id, req.language, req.code, null, now);
  const active = activePracticeSession(problem.id);
  if (active) snapshot(active.id, req.slug, req.language, req.code, now);
}

function snapshot(sessionId: string, slug: string, language: Language, code: string, now: number): void {
  const last = sessionEvents(sessionId, "code_snapshot").at(-1);
  if (!last || now - last.ts >= SNAPSHOT_EVERY_MS) addEvent(sessionId, "code_snapshot", { slug, language, code }, now);
}

function practiceSession(slug: string, sessionId: string | undefined, what: "hint" | "editorial" = "editorial"): Resolved {
  const resolved = resolveSession(slug, sessionId);
  if (resolved.session.mode === "oa") throw new ApiError(403, "Hints and the editorial aren't available during an assessment.");
  // Interviews allow hints (logged; they lower the score) but keep the editorial for the debrief.
  if (resolved.session.mode === "interview" && what === "editorial") {
    throw new ApiError(403, "The editorial is shown in the debrief, after the interview.");
  }
  return resolved;
}

function revealedLevels(session: SessionRow): Set<number> {
  return new Set(sessionEvents<{ level: number }>(session.id, "hint").map((e) => e.payload.level));
}

export function isSolved(itemId: string): boolean {
  return problemStatuses().get(itemId) === "solved";
}

/** Hint levels 1–4. Each level needs the previous one first (unless the problem is already solved). */
export function revealHint(req: { slug: string; level: number; sessionId?: string }): HintPayload {
  const { problem, session } = practiceSession(req.slug, req.sessionId, "hint");
  const priv = getDsaPrivate(req.slug)!;
  if (req.level < 1 || req.level > priv.hints.length) throw new ApiError(400, "No such hint level.");
  const seen = revealedLevels(session);
  if (!seen.has(req.level)) {
    if (req.level > 1 && !seen.has(req.level - 1) && !isSolved(problem.id)) {
      throw new ApiError(409, `Reveal hint ${req.level - 1} first.`);
    }
    addEvent(session.id, "hint", { slug: req.slug, level: req.level, penalized: session.mode === "interview" });
  }
  return { sessionId: session.id, level: req.level, text: priv.hints[req.level - 1]! };
}

function editorialPayload(slug: string): EditorialPayload {
  const priv = getDsaPrivate(slug)!;
  return { editorialMd: priv.editorialMd, references: priv.references };
}

/** Level 5: the full editorial. Needs all four hints, or a solved problem. */
export function revealEditorial(req: { slug: string; sessionId?: string }): EditorialPayload & { sessionId: string } {
  const { problem, session } = practiceSession(req.slug, req.sessionId);
  const priv = getDsaPrivate(req.slug)!;
  const seen = revealedLevels(session);
  const level = priv.hints.length + 1;
  if (!seen.has(level)) {
    const all = priv.hints.every((_, i) => seen.has(i + 1));
    if (!all && !isSolved(problem.id)) throw new ApiError(409, "Reveal all four hints first, or give up to see the editorial.");
    addEvent(session.id, "hint", { slug: req.slug, level });
  }
  return { sessionId: session.id, ...editorialPayload(req.slug) };
}

/** Explicit surrender: shows the editorial now, ends the session, and schedules the problem for review. */
export function giveUp(req: { slug: string; sessionId?: string }): EditorialPayload {
  const { problem, session } = practiceSession(req.slug, req.sessionId);
  const priv = getDsaPrivate(req.slug)!;
  addEvent(session.id, "hint", { slug: req.slug, level: priv.hints.length + 1, gaveUp: true });
  recordAttempt(problem.id, "gave-up");
  endSession(session.id, "abandoned");
  return editorialPayload(req.slug);
}

// ---- page data -------------------------------------------------------------------------------------

export interface ProblemPageData {
  pub: DsaPublic;
  itemId: string;
  solved: boolean;
  sessionId: string | null;
  revealedHints: { level: number; text: string }[];
  /** Only when this session already revealed it; otherwise the client asks. */
  editorial: EditorialPayload | null;
}

export function loadProblemPage(slug: string): ProblemPageData | null {
  const problem = getDsa(slug);
  if (!problem) return null;
  const priv = getDsaPrivate(slug)!;
  const session = activePracticeSession(problem.id);
  const seen = session ? revealedLevels(session) : new Set<number>();
  return {
    pub: problem.pub,
    itemId: problem.id,
    solved: isSolved(problem.id),
    sessionId: session?.id ?? null,
    revealedHints: priv.hints.map((text, i) => ({ level: i + 1, text })).filter((h) => seen.has(h.level)),
    editorial: seen.has(priv.hints.length + 1) ? editorialPayload(slug) : null,
  };
}
