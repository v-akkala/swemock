import { z } from "zod";
import type { Rubric } from "./rubrics";
import type { BehavioralMetrics } from "../rounds/signals";

/**
 * Scoring formulas (spec §7.5). Versioned: every scorecard stores the version it was computed with, so
 * scores stay comparable when the formulas change. Documented in docs/scoring.md.
 */
export const FORMULA_VERSION = "1";

export const SCORE_SOURCES = ["auto", "self", "ai"] as const;
export type ScoreSource = (typeof SCORE_SOURCES)[number];

export const RECOMMENDATIONS = ["strong_no_hire", "lean_no_hire", "lean_hire", "strong_hire"] as const;
export const recommendationSchema = z.enum(RECOMMENDATIONS);
export type Recommendation = z.infer<typeof recommendationSchema>;
export { RECOMMENDATION_LABELS } from "./labels";

export type Level = 1 | 2 | 3 | 4;

export interface SourcedScore {
  dimension: string;
  source: ScoreSource;
  score: Level;
  /** Why: metrics for auto, ticked items for self, quotes/timestamps for ai. */
  evidence: string[];
}

const clamp = (n: number): Level => Math.min(4, Math.max(1, Math.round(n))) as Level;

// ---- self -----------------------------------------------------------------------------------------

const WEIGHT = { must: 2, strong: 1 } as const;

/**
 * Self-checklist → 1–4 per dimension. Coverage = ticked weight of must-hit (2) and strong-signal (1)
 * items over the total; each ticked red flag removes 30 points. Bands: <25% → 1, <50% → 2, <75% → 3, else 4.
 */
export function selfScores(rubric: Rubric, ticked: Set<string>): SourcedScore[] {
  return rubric.dimensions.map((d) => {
    let total = 0;
    let got = 0;
    let reds = 0;
    const evidence: string[] = [];
    for (const item of d.items) {
      if (item.kind === "red") {
        if (ticked.has(item.id)) {
          reds++;
          evidence.push(`Red flag: ${item.text}`);
        }
        continue;
      }
      total += WEIGHT[item.kind];
      if (ticked.has(item.id)) {
        got += WEIGHT[item.kind];
        evidence.push(item.text);
      }
    }
    const pct = (total ? (got / total) * 100 : 0) - reds * 30;
    const score: Level = pct < 25 ? 1 : pct < 50 ? 2 : pct < 75 ? 3 : 4;
    return { dimension: d.id, source: "self", score, evidence };
  });
}

// ---- auto (DSA) --------------------------------------------------------------------------------------

export interface DsaMetrics {
  /** Best submission: tests passed and total (null if never submitted). */
  bestPassed: number | null;
  bestTotal: number | null;
  accepted: boolean;
  efficiency: "comparable" | "slower" | "much-slower" | null;
  submissions: number;
  failedSubmissionsBeforeAccept: number;
  runsBeforeFirstSubmit: number;
  customRunsBeforeAccept: number;
  hintsUsed: number;
  /** Minutes from the start to the first accepted submission, if any. */
  minutesToAccept: number | null;
}

/** Objective scores for the dimensions the event log can measure. Others are left to self or AI. */
export function autoDsaScores(m: DsaMetrics): SourcedScore[] {
  const out: SourcedScore[] = [];
  const hintPenalty = m.hintsUsed >= 3 ? 2 : m.hintsUsed >= 1 ? 1 : 0;

  if (m.bestTotal) {
    const share = (m.bestPassed ?? 0) / m.bestTotal;
    const base = share === 1 ? 4 : share >= 0.75 ? 3 : share >= 0.4 ? 2 : 1;
    out.push({
      dimension: "correctness",
      source: "auto",
      score: clamp(base - (m.failedSubmissionsBeforeAccept >= 3 ? 1 : 0) - (hintPenalty > 1 ? 1 : 0)),
      evidence: [
        `Best submission passed ${m.bestPassed}/${m.bestTotal} tests`,
        ...(m.failedSubmissionsBeforeAccept ? [`${m.failedSubmissionsBeforeAccept} failed submission(s) before accepted`] : []),
        ...(m.hintsUsed ? [`${m.hintsUsed} hint(s) used`] : []),
      ],
    });
  } else {
    out.push({ dimension: "correctness", source: "auto", score: 1, evidence: ["No submission"] });
  }

  const algoBase = !m.accepted ? (m.bestTotal && (m.bestPassed ?? 0) / m.bestTotal >= 0.6 ? 2 : 1)
    : m.efficiency === "much-slower" ? 2 : m.efficiency === "slower" ? 3 : 4;
  out.push({
    dimension: "algorithm",
    source: "auto",
    score: clamp(algoBase - hintPenalty),
    evidence: [
      m.accepted ? `Accepted; efficiency ${m.efficiency ?? "unknown"} relative to the reference` : "Not accepted",
      ...(hintPenalty ? [`Hint penalty −${hintPenalty}`] : []),
    ],
  });

  const testBase = m.submissions === 0 ? 1 : m.runsBeforeFirstSubmit === 0 ? 1 : m.customRunsBeforeAccept > 0 ? 4 : 3;
  out.push({
    dimension: "testing",
    source: "auto",
    score: testBase as Level,
    evidence: [
      `${m.runsBeforeFirstSubmit} run(s) before the first submission`,
      `${m.customRunsBeforeAccept} run(s) with custom input before accepted`,
    ],
  });
  return out;
}

// ---- auto (recruiter, behavioral) -------------------------------------------------------------------

export type SelfGrade = 0 | 1 | 2;

export interface FundamentalsAnswer {
  difficulty: "easy" | "medium" | "hard";
  /** The candidate's own call after seeing the key points: 0 missed, 1 partly, 2 got it. */
  grade: SelfGrade;
}

export interface RecruiterMetrics {
  /** Questions the candidate self-graded, with their grades. Empty when the questions were asked elsewhere. */
  fundamentals: FundamentalsAnswer[];
  probesAsked: number;
}

const DIFFICULTY_WEIGHT = { easy: 1, medium: 2, hard: 3 } as const;

/**
 * Fundamentals score from the in-round self-grades, weighted by difficulty (1/2/3). The grades are
 * recorded one question at a time while the key points are on screen and can't be edited afterwards,
 * so they count as "auto"; the checklist and AI grading still override them (spec §7.5 ordering).
 * Bands as for the checklist: <25% → 1, <50% → 2, <75% → 3, else 4.
 */
export function autoRecruiterScores(m: RecruiterMetrics): SourcedScore[] {
  if (m.fundamentals.length === 0) return [];
  let total = 0;
  let got = 0;
  for (const a of m.fundamentals) {
    total += DIFFICULTY_WEIGHT[a.difficulty] * 2;
    got += DIFFICULTY_WEIGHT[a.difficulty] * a.grade;
  }
  const pct = (got / total) * 100;
  const count = (g: SelfGrade) => m.fundamentals.filter((a) => a.grade === g).length;
  return [
    {
      dimension: "fundamentals",
      source: "auto",
      score: pct < 25 ? 1 : pct < 50 ? 2 : pct < 75 ? 3 : 4,
      evidence: [
        `${m.fundamentals.length} question(s) self-graded: ${count(2)} got it, ${count(1)} partly, ${count(0)} missed`,
        `Weighted by difficulty: ${Math.round(pct)}%`,
      ],
    },
  ];
}

/** Objective scores for the behavioral dimensions the answer signals can measure. */
export function autoBehavioralScores(m: BehavioralMetrics): SourcedScore[] {
  if (m.answers === 0) return [];
  const out: SourcedScore[] = [];
  if (m.iShare !== null) {
    out.push({
      dimension: "ownership",
      source: "auto",
      score: m.iShare >= 0.75 ? 4 : m.iShare >= 0.55 ? 3 : m.iShare >= 0.35 ? 2 : 1,
      evidence: [`${Math.round(m.iShare * 100)}% of first-person pronouns were "I" rather than "we"`],
    });
  }
  out.push({
    dimension: "impact",
    source: "auto",
    score: m.numberShare >= 0.6 ? 4 : m.numberShare >= 0.4 ? 3 : m.numberShare >= 0.2 ? 2 : 1,
    evidence: [`${Math.round(m.numberShare * 100)}% of answers contained a number or metric`],
  });
  const w = m.avgWords;
  out.push({
    dimension: "concision",
    source: "auto",
    // About 2–3 minutes of speech is 250–450 words; typed answers run shorter, so the band is wide.
    score: w >= 90 && w <= 380 ? 4 : (w >= 60 && w < 90) || (w > 380 && w <= 480) ? 3 : (w >= 30 && w < 60) || (w > 480 && w <= 650) ? 2 : 1,
    evidence: [`Average answer length ${w} words${m.avgDurationSec !== null ? `, ${m.avgDurationSec}s to answer` : ""}`],
  });
  return out;
}

// ---- auto (LLD) -------------------------------------------------------------------------------------

export interface LldMetrics {
  /** Best submission's core and edge results (the tests that decide "solved"). */
  bestCoreEdge: { passed: number; total: number } | null;
  /** Extension tests in the best submission made after the change; null if the change never came or no such submit. */
  extension: { passed: number; total: number } | null;
  solved: boolean;
  submissions: number;
  runs: number;
  hintsUsed: number;
  minutesToSolve: number | null;
  /** Edits to provided files in the final submission. */
  edits: { path: string; added: number; removed: number }[];
}

/**
 * Working code: core and edge tests count for 75%, extension tests for 25% (all of it when the change was
 * never introduced). All passing → 4, ≥ 85% → 3, ≥ 50% → 2, else 1; minus 1 for three or more hints.
 */
export function autoLldScores(m: LldMetrics): SourcedScore[] {
  const hintPenalty = m.hintsUsed >= 3 ? 1 : 0;
  if (!m.bestCoreEdge || m.bestCoreEdge.total === 0) return [{ dimension: "correctness", source: "auto", score: 1, evidence: ["No submission"] }];
  const base = m.bestCoreEdge.passed / m.bestCoreEdge.total;
  const share = m.extension && m.extension.total ? 0.75 * base + 0.25 * (m.extension.passed / m.extension.total) : base;
  const raw = share >= 1 ? 4 : share >= 0.85 ? 3 : share >= 0.5 ? 2 : 1;
  return [
    {
      dimension: "correctness",
      source: "auto",
      score: clamp(raw - hintPenalty),
      evidence: [
        `Core and edge tests: ${m.bestCoreEdge.passed}/${m.bestCoreEdge.total}`,
        ...(m.extension ? [`Extension tests: ${m.extension.passed}/${m.extension.total}`] : []),
        ...(m.hintsUsed ? [`${m.hintsUsed} hint(s) used`] : []),
      ],
    },
  ];
}

// ---- auto (AI Fluency) --------------------------------------------------------------------------------

/** How the candidate used the assistant, from the event log. */
export interface AiUse {
  queries: number;
  /** Assistant replies whose proposed code was applied, in part or in full. */
  applies: number;
  hunksAccepted: number;
  hunksRejected: number;
  /** Applies after which the candidate ran a command or the tests before the next apply. */
  appliesVerified: number;
  /** The candidate wrote or edited a test of their own. */
  ownTests: boolean;
  mutationsInjected: number;
  mutationsCaught: number;
}

const atLeast = (x: number, t4: number, t3: number, t2: number): Level => (x >= t4 ? 4 : x >= t3 ? 3 : x >= t2 ? 2 : 1);

/** Quality of AI use: null when the assistant wasn't used (not using it isn't penalized, and isn't scored). */
export function aiUseScore(ai: AiUse): { score: Level; evidence: string[] } | null {
  if (ai.queries === 0) return null;
  let score = 2;
  const evidence = [`${ai.queries} assistant question(s); ${ai.applies} reply(ies) applied (${ai.hunksAccepted} hunk(s) accepted, ${ai.hunksRejected} rejected)`];
  if (ai.applies === 0 || ai.appliesVerified / ai.applies >= 0.5) {
    score++;
    evidence.push(ai.applies ? `Ran code after ${ai.appliesVerified} of ${ai.applies} applied replies` : "Applied nothing blindly");
  } else evidence.push(`Ran code after only ${ai.appliesVerified} of ${ai.applies} applied replies`);
  if (ai.hunksRejected > 0 || ai.ownTests || ai.mutationsCaught > 0) {
    score++;
    evidence.push("Pushed back on or independently checked what the assistant produced");
  }
  if (ai.applies >= 3 && ai.appliesVerified === 0) score--;
  if (ai.mutationsInjected > 0) evidence.push(`Caught ${ai.mutationsCaught} of ${ai.mutationsInjected} injected mistake(s)`);
  if (ai.mutationsInjected > ai.mutationsCaught) score--;
  return { score: clamp(score), evidence };
}

export interface FindingMetrics {
  findings: number;
  planted: number;
  recall: number;
  precision: number;
  severityCalibration: number;
  matched: number;
}

const findingScores = (m: FindingMetrics, ids: { recall: string; precision: string; severity?: string }): SourcedScore[] => {
  const out: SourcedScore[] = [
    { dimension: ids.recall, source: "auto", score: atLeast(m.recall, 0.85, 0.6, 0.3), evidence: [`${m.matched} of ${m.planted} planted issues found (severity-weighted recall ${Math.round(m.recall * 100)}%)`] },
    {
      dimension: ids.precision,
      source: "auto",
      score: m.findings === 0 ? 1 : atLeast(m.precision, 0.85, 0.65, 0.4),
      evidence: [m.findings === 0 ? "No findings reported" : `${Math.round(m.precision * 100)}% of ${m.findings} finding(s) were real`],
    },
  ];
  if (ids.severity && m.matched > 0) {
    out.push({ dimension: ids.severity, source: "auto", score: atLeast(m.severityCalibration, 0.8, 0.6, 0.4), evidence: [`Severity matched the planted rating ${Math.round(m.severityCalibration * 100)}%`] });
  }
  return out;
};

export interface ComprehensionMetrics extends FindingMetrics {
  ai: AiUse;
}

export function autoComprehensionScores(m: ComprehensionMetrics): SourcedScore[] {
  const out = findingScores(m, { recall: "bug_recall", precision: "precision", severity: "severity" });
  const use = aiUseScore(m.ai);
  if (use) out.push({ dimension: "ai_use", source: "auto", ...use });
  return out;
}

export type ReviewDecision = "approve" | "request_changes" | "reject";

export interface ReviewMetrics extends FindingMetrics {
  /** The right call and the candidate's, if they made one. */
  correct: ReviewDecision;
  given: ReviewDecision | null;
  /** Best "fix" submission: hidden tests passed and total; null if none was made. */
  fix: { passed: number; total: number } | null;
}

/** Same call → 4; request changes versus reject → 3; approve versus request changes → 2; approve versus reject → 1. */
export function decisionScore(correct: ReviewDecision, given: ReviewDecision): Level {
  if (correct === given) return 4;
  const pair = new Set([correct, given]);
  if (pair.has("request_changes") && pair.has("reject")) return 3;
  if (pair.has("approve") && pair.has("request_changes")) return 2;
  return 1;
}

export function autoReviewScores(m: ReviewMetrics): SourcedScore[] {
  const out = findingScores(m, { recall: "recall", precision: "precision" });
  if (m.planted === 0) {
    // A correct PR: there is nothing to find, and only over-flagging hurts.
    out.splice(0, 1);
  }
  out.push(
    m.given
      ? { dimension: "decision", source: "auto", score: decisionScore(m.correct, m.given), evidence: [`Decided "${m.given.replace("_", " ")}"; the right call was "${m.correct.replace("_", " ")}"`] }
      : { dimension: "decision", source: "auto", score: 1, evidence: ["No final decision was made"] },
  );
  if (m.fix && m.fix.total > 0) {
    out.push({ dimension: "fix", source: "auto", score: atLeast(m.fix.passed / m.fix.total, 1, 0.75, 0.4), evidence: [`The fix passes ${m.fix.passed} of ${m.fix.total} hidden tests`] });
  }
  return out;
}

export interface ExtensionMetrics {
  /** Best submission by acceptance tests passed. */
  acceptance: { passed: number; total: number } | null;
  regression: { passed: number; total: number } | null;
  solved: boolean;
  submissions: number;
  minutesToSolve: number | null;
  minutesTotal: number;
  ai: AiUse;
  /** Test runs (any command) in the session. */
  runs: number;
}

export function autoExtensionScores(m: ExtensionMetrics): SourcedScore[] {
  const out: SourcedScore[] = [];
  const share = (x: { passed: number; total: number } | null) => (x && x.total ? x.passed / x.total : 0);
  out.push({
    dimension: "acceptance",
    source: "auto",
    score: m.acceptance ? atLeast(share(m.acceptance), 1, 0.75, 0.4) : 1,
    evidence: [m.acceptance ? `${m.acceptance.passed}/${m.acceptance.total} acceptance tests passed` : "No submission"],
  });
  out.push({
    dimension: "regression",
    source: "auto",
    score: m.regression ? atLeast(share(m.regression), 1, 0.9, 0.7) : 1,
    evidence: [m.regression ? `${m.regression.passed}/${m.regression.total} existing tests still pass` : "No submission"],
  });
  // Verification: tests after applying assistant code, diff review, own tests, caught mistakes. With no
  // assistant use, running tests and adding one is what counts.
  let v = 1;
  const evidence: string[] = [];
  if (m.runs >= 2) {
    v++;
    evidence.push(`${m.runs} test run(s)`);
  }
  if (m.ai.ownTests) {
    v++;
    evidence.push("Wrote or edited a test");
  }
  if (m.ai.applies > 0) {
    if (m.ai.appliesVerified / m.ai.applies >= 0.5) {
      v++;
      evidence.push(`Ran code after ${m.ai.appliesVerified} of ${m.ai.applies} applied replies`);
    }
    if (m.ai.hunksRejected > 0 || m.ai.mutationsCaught > 0) {
      v++;
      evidence.push("Reviewed diffs and pushed back");
    }
    if (m.ai.appliesVerified === 0) v--;
  }
  if (m.ai.mutationsInjected > m.ai.mutationsCaught) {
    v--;
    evidence.push(`Missed ${m.ai.mutationsInjected - m.ai.mutationsCaught} injected mistake(s)`);
  }
  out.push({ dimension: "verification", source: "auto", score: clamp(v), evidence: evidence.length ? evidence : ["No verification behavior recorded"] });
  const ratio = m.minutesToSolve !== null && m.minutesTotal ? m.minutesToSolve / m.minutesTotal : null;
  out.push({
    dimension: "time",
    source: "auto",
    score: ratio === null ? 1 : ratio <= 0.6 ? 4 : ratio <= 0.8 ? 3 : 2,
    evidence: [ratio === null ? "Never reached a fully passing submission" : `All tests passing after ${m.minutesToSolve} of ${m.minutesTotal} minutes`],
  });
  return out;
}

// ---- merge and recommend ----------------------------------------------------------------------------

/** Per dimension the most informed source wins: ai over self over auto. Every source is kept for display. */
export function finalScores(rubric: Rubric, scores: SourcedScore[]): Map<string, SourcedScore> {
  const rank: Record<ScoreSource, number> = { ai: 3, self: 2, auto: 1 };
  const out = new Map<string, SourcedScore>();
  for (const d of rubric.dimensions) {
    const best = scores.filter((s) => s.dimension === d.id).sort((a, b) => rank[b.source] - rank[a.source])[0];
    if (best) out.set(d.id, best);
  }
  return out;
}

export interface Caps {
  /** Hidden tests not all passing caps the recommendation at Lean No Hire (spec §7.5 example). */
  failedHiddenTests: boolean;
}

/**
 * Recommendation from the mean of the final dimension scores: ≥3.5 Strong Hire, ≥2.75 Lean Hire,
 * ≥2 Lean No Hire, else Strong No Hire; then hard caps. Needs at least one self or AI score: objective
 * metrics alone don't cover communication or understanding (spec: show only the metrics then).
 */
export function recommend(rubric: Rubric, scores: SourcedScore[], caps: Caps): Recommendation | null {
  if (!scores.some((s) => s.source !== "auto")) return null;
  const final = [...finalScores(rubric, scores).values()];
  if (final.length === 0) return null;
  const mean = final.reduce((sum, s) => sum + s.score, 0) / final.length;
  let rec: Recommendation = mean >= 3.5 ? "strong_hire" : mean >= 2.75 ? "lean_hire" : mean >= 2 ? "lean_no_hire" : "strong_no_hire";
  if (caps.failedHiddenTests && RECOMMENDATIONS.indexOf(rec) > RECOMMENDATIONS.indexOf("lean_no_hire")) rec = "lean_no_hire";
  return rec;
}
