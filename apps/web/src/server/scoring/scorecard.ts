import "server-only";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { summarizeSignals, type BehavioralMetrics } from "@swemock/shared";
import {
  FORMULA_VERSION,
  autoBehavioralScores,
  autoDsaScores,
  autoLldScores,
  type LldMetrics,
  autoRecruiterScores,
  finalScores,
  recommend,
  rubricForRound,
  selfScores,
  type AiGrade,
  type DsaMetrics,
  type Level,
  type Recommendation,
  type Rubric,
  type SourcedScore,
} from "@swemock/shared/scoring";
import { getDb } from "../db";
import { scorecards } from "../db/schema";
import { getSession, sessionEvents, type SessionRow } from "../dsa/store";
import { answerTurns } from "../interview/answers";
import { readState } from "../interview/state";

type SubmitPayload = { verdict: string; passed: number; total: number; efficiency?: DsaMetrics["efficiency"] };
type RunPayload = { custom?: boolean };

/** Objective metrics from the event log (spec §7.5 "auto"). */
export function dsaMetrics(session: SessionRow): DsaMetrics {
  const all = sessionEvents<Record<string, unknown>>(session.id);
  const submits = all.filter((e) => e.kind === "submit") as unknown as { ts: number; payload: SubmitPayload }[];
  const runs = all.filter((e) => e.kind === "run") as unknown as { ts: number; payload: RunPayload }[];
  const firstAccept = submits.find((s) => s.payload.verdict === "accepted");
  const firstSubmitTs = submits[0]?.ts ?? Infinity;
  const acceptTs = firstAccept?.ts ?? Infinity;
  let best: SubmitPayload | null = null;
  for (const s of submits) {
    if (s.payload.total > 0 && (!best || s.payload.passed / s.payload.total >= best.passed / best.total)) best = s.payload;
  }
  return {
    bestPassed: best?.passed ?? null,
    bestTotal: best?.total ?? null,
    accepted: Boolean(firstAccept),
    efficiency: firstAccept?.payload.efficiency ?? null,
    submissions: submits.length,
    failedSubmissionsBeforeAccept: submits.filter((s) => s.ts < acceptTs && s.payload.verdict !== "accepted").length,
    runsBeforeFirstSubmit: runs.filter((r) => r.ts < firstSubmitTs).length,
    customRunsBeforeAccept: runs.filter((r) => r.ts < acceptTs && r.payload.custom).length,
    hintsUsed: all.filter((e) => e.kind === "hint").length,
    minutesToAccept: firstAccept ? Math.round((firstAccept.ts - session.startedAt) / 6000) / 10 : null,
  };
}

type Counts = Record<"core" | "edge" | "extension", { passed: number; total: number }>;

/** Objective metrics for a low-level design round, from the run/submit events. */
export function lldMetrics(session: SessionRow): LldMetrics {
  const all = sessionEvents<Record<string, unknown>>(session.id);
  const submits = all.filter((e) => e.kind === "submit") as unknown as { ts: number; payload: { verdict: string; counts: Counts; extension: boolean; edits?: Record<string, { added: number; removed: number }> } }[];
  const core = (c: Counts) => ({ passed: c.core.passed + c.edge.passed, total: c.core.total + c.edge.total });
  let best: (typeof submits)[number] | null = null;
  for (const s of submits) {
    const a = core(s.payload.counts);
    const b = best ? core(best.payload.counts) : null;
    if (a.total > 0 && (!b || a.passed / a.total >= b.passed / b.total)) best = s;
  }
  const withExt = submits.filter((s) => s.payload.extension && s.payload.counts.extension.total > 0);
  let bestExt: { passed: number; total: number } | null = null;
  for (const s of withExt) {
    const e = s.payload.counts.extension;
    if (!bestExt || e.passed / e.total >= bestExt.passed / bestExt.total) bestExt = e;
  }
  const solvedAt = submits.find((s) => s.payload.verdict === "accepted");
  const last = submits.at(-1);
  return {
    bestCoreEdge: best ? core(best.payload.counts) : null,
    extension: bestExt,
    solved: Boolean(solvedAt),
    submissions: submits.length,
    runs: all.filter((e) => e.kind === "run").length,
    hintsUsed: all.filter((e) => e.kind === "hint").length,
    minutesToSolve: solvedAt ? Math.round((solvedAt.ts - session.startedAt) / 6000) / 10 : null,
    edits: Object.entries(last?.payload.edits ?? {}).map(([path, e]) => ({ path, ...e })),
  };
}

/** Auto scores and the metric lines the debrief shows, per round type. */
function autoFor(session: SessionRow): { scores: SourcedScore[]; lines: string[]; dsa: DsaMetrics | null; behavioral: BehavioralMetrics | null; lld?: LldMetrics } {
  if (session.roundType === "lld") {
    const m = lldMetrics(session);
    return {
      scores: autoLldScores(m),
      lines: [
        m.bestCoreEdge ? `Best submission: ${m.bestCoreEdge.passed}/${m.bestCoreEdge.total} core and edge tests` : "No submission",
        m.extension ? `Extension tests (new requirement): ${m.extension.passed}/${m.extension.total}` : "New requirement: not tested",
        m.solved ? `All core and edge tests passed after ${m.minutesToSolve} min` : "Core and edge tests never all passed",
        `Submissions: ${m.submissions}; test runs: ${m.runs}`,
        `Hints and nudges: ${m.hintsUsed}`,
        m.edits.length ? `Edited provided code: ${m.edits.map((e) => `${e.path} (+${e.added} −${e.removed})`).join(", ")}` : "Provided code left untouched",
      ],
      dsa: null,
      behavioral: null,
      lld: m,
    };
  }
  if (session.roundType === "recruiter") {
    const round = readState(session).round;
    const rec = round?.kind === "recruiter" ? round : null;
    const graded = rec ? rec.pool.filter((p) => p.id in rec.grades).map((p) => ({ difficulty: p.difficulty, grade: rec.grades[p.id]! })) : [];
    const probesAsked = sessionEvents<{ ref?: { kind: string } }>(session.id, "chat").filter((e) => e.payload.ref?.kind === "probe").length;
    const count = (g: number) => graded.filter((a) => a.grade === g).length;
    return {
      scores: autoRecruiterScores({ fundamentals: graded, probesAsked }),
      lines: [
        `Resume deep dives asked: ${probesAsked}`,
        `Fundamentals questions asked: ${rec?.asked.length ?? 0}`,
        graded.length ? `Self-graded: ${count(2)} got it, ${count(1)} partly, ${count(0)} missed` : "No fundamentals self-grades recorded",
      ],
      dsa: null,
      behavioral: null,
    };
  }
  if (session.roundType === "behavioral") {
    const answers = answerTurns(session.id).filter((t) => t.counts);
    const m = summarizeSignals(answers.map((t) => t.signals));
    return {
      scores: autoBehavioralScores(m),
      lines: [
        `Answers: ${m.answers}, averaging ${m.avgWords} words`,
        m.iShare !== null ? `Ownership: ${Math.round(m.iShare * 100)}% "I" versus "we"` : "Ownership: no first-person pronouns found",
        `Answers with a number: ${Math.round(m.numberShare * 100)}%`,
        m.avgDurationSec !== null ? `Average time to answer: ${m.avgDurationSec}s` : "Time to answer: n/a",
        ...(m.fillers !== null ? [`Filler words (voice): ${m.fillers}`, m.avgWpm !== null ? `Pace: ${m.avgWpm} words per minute` : "Pace: n/a"] : []),
      ],
      dsa: null,
      behavioral: m,
    };
  }
  const m = dsaMetrics(session);
  return {
    scores: autoDsaScores(m),
    lines: [
      `Best submission: ${m.bestTotal ? `${m.bestPassed}/${m.bestTotal} tests` : "none"}`,
      m.accepted ? `Accepted after ${m.minutesToAccept} min` : "Not accepted",
      `Submissions: ${m.submissions}`,
      `Runs before the first submit: ${m.runsBeforeFirstSubmit}`,
      `Runs with your own input: ${m.customRunsBeforeAccept}`,
      `Hints and nudges: ${m.hintsUsed}`,
    ],
    dsa: m,
    behavioral: null,
  };
}

interface StoredCard {
  /** Self and AI scores; auto scores are recomputed from events on every read. */
  scores: SourcedScore[];
  selfTicked: string[] | null;
  ai: {
    recommendation: Recommendation;
    strengths: string[];
    improvements: string[];
    strongCandidate: string;
    grader: string;
    promptVersion: string;
    at: number;
  } | null;
}

export interface ScorecardView {
  roundType: string;
  rubric: Rubric;
  /** Coding rounds only; other rounds show `metricLines`. */
  metrics: DsaMetrics | null;
  metricLines: string[];
  behavioral: BehavioralMetrics | null;
  scores: SourcedScore[];
  final: Record<string, SourcedScore>;
  recommendation: Recommendation | null;
  selfTicked: string[] | null;
  ai: StoredCard["ai"];
  formulaVersion: string;
  sources: ("auto" | "self" | "ai")[];
}

function loadStored(sessionId: string): { id: string | null; card: StoredCard } {
  const row = getDb().select().from(scorecards).where(eq(scorecards.sessionId, sessionId)).get();
  if (!row) return { id: null, card: { scores: [], selfTicked: null, ai: null } };
  return { id: row.id, card: JSON.parse(row.dimensionsJson) as StoredCard };
}

function view(session: SessionRow, card: StoredCard): ScorecardView {
  const rubric = rubricForRound(session.roundType);
  const auto = autoFor(session);
  const scores = [...auto.scores, ...card.scores];
  const final = Object.fromEntries(finalScores(rubric, scores));
  return {
    roundType: session.roundType,
    rubric,
    metrics: auto.dsa,
    metricLines: auto.lines,
    behavioral: auto.behavioral,
    scores,
    final,
    recommendation: recommend(rubric, scores, { failedHiddenTests: auto.dsa ? !auto.dsa.accepted : auto.lld ? !auto.lld.solved : false }),
    selfTicked: card.selfTicked,
    ai: card.ai,
    formulaVersion: FORMULA_VERSION,
    sources: (["auto", "self", "ai"] as const).filter((s) => scores.some((x) => x.source === s)),
  };
}

function save(session: SessionRow, id: string | null, card: StoredCard): ScorecardView {
  const v = view(session, card);
  const values = {
    dimensionsJson: JSON.stringify(card),
    recommendation: v.recommendation,
    grader: card.ai?.grader ?? (card.selfTicked ? "self" : "auto"),
    promptVersion: card.ai?.promptVersion ?? null,
    formulaVersion: FORMULA_VERSION,
  };
  if (id) getDb().update(scorecards).set(values).where(eq(scorecards.id, id)).run();
  else getDb().insert(scorecards).values({ id: ulid(), sessionId: session.id, ...values }).run();
  return v;
}

export function loadScorecard(sessionId: string): ScorecardView {
  const session = getSession(sessionId)!;
  return view(session, loadStored(sessionId).card);
}

export function saveSelfScore(sessionId: string, ticked: string[]): ScorecardView {
  const session = getSession(sessionId)!;
  const { id, card } = loadStored(sessionId);
  const rubric = rubricForRound(session.roundType);
  const valid = new Set(rubric.dimensions.flatMap((d) => d.items.map((i) => i.id)));
  const set = new Set(ticked.filter((t) => valid.has(t)));
  card.selfTicked = [...set];
  card.scores = [...card.scores.filter((s) => s.source !== "self"), ...selfScores(rubric, set)];
  return save(session, id, card);
}

export function saveAiGrade(sessionId: string, grade: AiGrade, grader: string, promptVersion: string): ScorecardView {
  const session = getSession(sessionId)!;
  const { id, card } = loadStored(sessionId);
  card.scores = [
    ...card.scores.filter((s) => s.source !== "ai"),
    ...grade.dimensions.map((d): SourcedScore => ({ dimension: d.id, source: "ai", score: d.score as Level, evidence: d.evidence })),
  ];
  card.ai = {
    recommendation: grade.recommendation,
    strengths: grade.strengths,
    improvements: grade.improvements,
    strongCandidate: grade.strong_candidate,
    grader,
    promptVersion,
    at: Date.now(),
  };
  return save(session, id, card);
}
