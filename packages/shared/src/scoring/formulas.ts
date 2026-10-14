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
