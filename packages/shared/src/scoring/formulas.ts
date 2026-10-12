import { z } from "zod";
import type { Rubric } from "./rubrics";

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
