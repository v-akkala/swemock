import "server-only";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { DSA_INTERVIEW_RUBRIC, FORMULA_VERSION, autoDsaScores, finalScores, recommend, selfScores, type AiGrade, type DsaMetrics, type Level, type Recommendation, type Rubric, type SourcedScore } from "@swemock/shared/scoring";
import { getDb } from "../db";
import { scorecards } from "../db/schema";
import { getSession, sessionEvents, type SessionRow } from "../dsa/store";

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
  rubric: Rubric;
  metrics: DsaMetrics;
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
  const rubric = DSA_INTERVIEW_RUBRIC;
  const metrics = dsaMetrics(session);
  const scores = [...autoDsaScores(metrics), ...card.scores];
  const final = Object.fromEntries(finalScores(rubric, scores));
  return {
    rubric,
    metrics,
    scores,
    final,
    recommendation: recommend(rubric, scores, { failedHiddenTests: !metrics.accepted }),
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
  const valid = new Set(DSA_INTERVIEW_RUBRIC.dimensions.flatMap((d) => d.items.map((i) => i.id)));
  const set = new Set(ticked.filter((t) => valid.has(t)));
  card.selfTicked = [...set];
  card.scores = [...card.scores.filter((s) => s.source !== "self"), ...selfScores(DSA_INTERVIEW_RUBRIC, set)];
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
