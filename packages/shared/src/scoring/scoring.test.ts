import { describe, expect, it } from "vitest";
import { aiGradeSchema, checkGradeAgainstRubric, exampleGrade } from "./ai-grade";
import { aiUseScore, autoBehavioralScores, autoComprehensionScores, autoDsaScores, autoExtensionScores, autoLldScores, autoRecruiterScores, autoReviewScores, decisionScore, finalScores, recommend, selfScores, type AiUse, type DsaMetrics, type SourcedScore } from "./formulas";
import { extractJsonBlock } from "./json-block";
import { BEHAVIORAL_RUBRIC, DSA_INTERVIEW_RUBRIC as R, RECRUITER_RUBRIC, LLD_RUBRIC, RUBRICS, rubricForRound } from "./rubrics";

const allItems = (kind?: string) =>
  new Set(R.dimensions.flatMap((d) => d.items.filter((i) => !kind || i.kind === kind).map((i) => i.id)));

describe("selfScores", () => {
  it("maps checklist coverage to bands", () => {
    const none = selfScores(R, new Set());
    expect(none.every((s) => s.score === 1 && s.source === "self")).toBe(true);
    const all = selfScores(R, new Set([...allItems("must"), ...allItems("strong")]));
    expect(all.every((s) => s.score === 4)).toBe(true);
    const mustOnly = selfScores(R, allItems("must"));
    // understanding: must 3×2=6 of 7 → 86% → 4; correctness: 4/4 → 4; code_quality 4/5 → 80% → 4
    expect(mustOnly.find((s) => s.dimension === "understanding")!.score).toBe(4);
  });

  it("subtracts red flags", () => {
    const ticked = new Set([...allItems("must"), ...allItems("strong"), "u-none"]);
    const u = selfScores(R, ticked).find((s) => s.dimension === "understanding")!;
    expect(u.score).toBe(3);
    expect(u.evidence.some((e) => e.startsWith("Red flag"))).toBe(true);
  });
});

const base: DsaMetrics = {
  bestPassed: 20,
  bestTotal: 20,
  accepted: true,
  efficiency: "comparable",
  submissions: 1,
  failedSubmissionsBeforeAccept: 0,
  runsBeforeFirstSubmit: 2,
  customRunsBeforeAccept: 1,
  hintsUsed: 0,
  minutesToAccept: 20,
};
const auto = (m: Partial<DsaMetrics>) => Object.fromEntries(autoDsaScores({ ...base, ...m }).map((s) => [s.dimension, s.score]));

describe("autoDsaScores", () => {
  it("rewards a clean, tested, efficient solve", () => {
    expect(auto({})).toEqual({ correctness: 4, algorithm: 4, testing: 4 });
  });

  it("scores partial credit, inefficiency, hints, and untested submits", () => {
    expect(auto({ accepted: false, bestPassed: 10, efficiency: null }).correctness).toBe(2);
    expect(auto({ efficiency: "much-slower" }).algorithm).toBe(2);
    expect(auto({ hintsUsed: 3 })).toMatchObject({ algorithm: 2, correctness: 3 });
    expect(auto({ runsBeforeFirstSubmit: 0 }).testing).toBe(1);
    expect(auto({ customRunsBeforeAccept: 0 }).testing).toBe(3);
    expect(auto({ bestPassed: null, bestTotal: null, accepted: false, submissions: 0 })).toMatchObject({ correctness: 1, testing: 1 });
  });
});

describe("recommend", () => {
  const s = (dimension: string, source: SourcedScore["source"], score: 1 | 2 | 3 | 4): SourcedScore => ({ dimension, source, score, evidence: [] });

  it("needs a self or AI score", () => {
    expect(recommend(R, autoDsaScores(base), { failedHiddenTests: false })).toBeNull();
  });

  it("prefers ai over self over auto per dimension", () => {
    const f = finalScores(R, [s("algorithm", "auto", 4), s("algorithm", "self", 2), s("algorithm", "ai", 3)]);
    expect(f.get("algorithm")).toMatchObject({ source: "ai", score: 3 });
  });

  it("maps the mean to a recommendation and applies the hidden-test cap", () => {
    const all4 = R.dimensions.map((d) => s(d.id, "self", 4));
    expect(recommend(R, all4, { failedHiddenTests: false })).toBe("strong_hire");
    expect(recommend(R, all4, { failedHiddenTests: true })).toBe("lean_no_hire");
    const all3 = R.dimensions.map((d) => s(d.id, "ai", 3));
    expect(recommend(R, all3, { failedHiddenTests: false })).toBe("lean_hire");
    const all1 = R.dimensions.map((d) => s(d.id, "self", 1));
    expect(recommend(R, all1, { failedHiddenTests: false })).toBe("strong_no_hire");
  });
});

describe("AI grade", () => {
  it("accepts the example shape and checks dimensions against the rubric", () => {
    const g = aiGradeSchema.parse(exampleGrade(R));
    expect(checkGradeAgainstRubric(g, R)).toBeNull();
    expect(checkGradeAgainstRubric({ ...g, dimensions: g.dimensions.slice(1) }, R)).toContain("missing");
    expect(aiGradeSchema.safeParse({ ...g, recommendation: "hire" }).success).toBe(false);
  });
});

describe("extractJsonBlock", () => {
  it("takes the last fenced json block", () => {
    const r = extractJsonBlock('Some text\n```json\n{"a": 1}\n```\nmore\n```json\n{"b": 2}\n```\n');
    expect(r).toMatchObject({ ok: true, value: { b: 2 } });
  });

  it("accepts an unlabeled fence or a trailing bare object", () => {
    expect(extractJsonBlock('```\n{"a": 1}\n```')).toMatchObject({ ok: true, value: { a: 1 } });
    expect(extractJsonBlock('Here you go:\n{"a": [1, 2]}')).toMatchObject({ ok: true, value: { a: [1, 2] } });
  });

  it("explains failures and keeps the raw text", () => {
    expect(extractJsonBlock("no json here")).toMatchObject({ ok: false, raw: null });
    const bad = extractJsonBlock('```json\n{"a": 1,}\n```');
    expect(bad).toMatchObject({ ok: false, raw: '{"a": 1,}' });
  });
});

describe("round rubrics", () => {
  it("are registered, with unique item ids and every dimension scoreable by the checklist", () => {
    expect(rubricForRound("recruiter")).toBe(RECRUITER_RUBRIC);
    expect(rubricForRound("behavioral")).toBe(BEHAVIORAL_RUBRIC);
    expect(rubricForRound("dsa")).toBe(R);
    expect(rubricForRound("lld")).toBe(LLD_RUBRIC);
    for (const rubric of Object.values(RUBRICS)) {
      const ids = rubric.dimensions.flatMap((d) => d.items.map((i) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const d of rubric.dimensions) expect(d.items.some((i) => i.kind === "must")).toBe(true);
      const all = new Set(rubric.dimensions.flatMap((d) => d.items.filter((i) => i.kind !== "red").map((i) => i.id)));
      expect(selfScores(rubric, all).every((s) => s.score === 4)).toBe(true);
    }
  });
});

describe("autoRecruiterScores", () => {
  it("weights self-grades by difficulty", () => {
    expect(autoRecruiterScores({ fundamentals: [], probesAsked: 0 })).toEqual([]);
    const strong = autoRecruiterScores({
      fundamentals: [
        { difficulty: "easy", grade: 2 },
        { difficulty: "medium", grade: 2 },
        { difficulty: "hard", grade: 1 },
      ],
      probesAsked: 2,
    })[0]!;
    // got = 1×2 + 2×2 + 3×1 = 9 of 12 → 75% → 4
    expect(strong).toMatchObject({ dimension: "fundamentals", source: "auto", score: 4 });
    const weak = autoRecruiterScores({
      fundamentals: [
        { difficulty: "easy", grade: 2 },
        { difficulty: "hard", grade: 0 },
        { difficulty: "hard", grade: 0 },
      ],
      probesAsked: 0,
    })[0]!;
    // got = 2 of 14 → 14% → 1
    expect(weak.score).toBe(1);
  });
});

describe("autoBehavioralScores", () => {
  const m = { answers: 4, avgWords: 160, iShare: 0.8, numberShare: 0.5, avgDurationSec: 150, voiceAnswers: 0, fillers: null, avgWpm: null };
  it("scores ownership, impact, and concision from the signals", () => {
    const scores = Object.fromEntries(autoBehavioralScores(m).map((s) => [s.dimension, s.score]));
    expect(scores).toEqual({ ownership: 4, impact: 3, concision: 4 });
    expect(autoBehavioralScores({ ...m, iShare: 0.2, numberShare: 0, avgWords: 700 }).map((s) => s.score)).toEqual([1, 1, 1]);
    expect(autoBehavioralScores({ ...m, iShare: null }).map((s) => s.dimension)).toEqual(["impact", "concision"]);
    expect(autoBehavioralScores({ ...m, answers: 0 })).toEqual([]);
  });
});

describe("autoLldScores", () => {
  const m = { bestCoreEdge: { passed: 10, total: 10 }, extension: null, solved: true, submissions: 1, runs: 2, hintsUsed: 0, minutesToSolve: 20, edits: [] };
  it("scores working code from the best submission, weighting the extension tests", () => {
    expect(autoLldScores(m)[0]).toMatchObject({ dimension: "correctness", source: "auto", score: 4 });
    expect(autoLldScores({ ...m, extension: { passed: 0, total: 4 } })[0]!.score).toBe(2); // 0.75 of the weight
    expect(autoLldScores({ ...m, extension: { passed: 2, total: 4 } })[0]!.score).toBe(3); // 0.875
    expect(autoLldScores({ ...m, bestCoreEdge: { passed: 5, total: 10 } })[0]!.score).toBe(2);
    expect(autoLldScores({ ...m, bestCoreEdge: { passed: 1, total: 10 } })[0]!.score).toBe(1);
    expect(autoLldScores({ ...m, hintsUsed: 3 })[0]!.score).toBe(3);
    expect(autoLldScores({ ...m, bestCoreEdge: null })[0]!.score).toBe(1);
  });
});


const ai: AiUse = { queries: 3, applies: 2, hunksAccepted: 3, hunksRejected: 0, appliesVerified: 2, ownTests: false, mutationsInjected: 0, mutationsCaught: 0 };

describe("aiUseScore", () => {
  it("is null when the assistant wasn't used", () => {
    expect(aiUseScore({ ...ai, queries: 0 })).toBeNull();
  });

  it("rewards verifying and pushing back, and punishes blind use and missed mistakes", () => {
    expect(aiUseScore(ai)!.score).toBe(3);
    expect(aiUseScore({ ...ai, hunksRejected: 1 })!.score).toBe(4);
    expect(aiUseScore({ ...ai, appliesVerified: 0 })!.score).toBe(2);
    expect(aiUseScore({ ...ai, applies: 3, appliesVerified: 0 })!.score).toBe(1);
    expect(aiUseScore({ ...ai, mutationsInjected: 1, mutationsCaught: 0 })!.score).toBe(2);
    expect(aiUseScore({ ...ai, mutationsInjected: 1, mutationsCaught: 1 })!.score).toBe(4);
  });
});

const finding = { findings: 5, planted: 6, recall: 0.9, precision: 0.9, severityCalibration: 0.85, matched: 5 };

describe("autoComprehensionScores", () => {
  const byDim = (m: Parameters<typeof autoComprehensionScores>[0]) => Object.fromEntries(autoComprehensionScores(m).map((x) => [x.dimension, x.score]));

  it("bands recall, precision and severity calibration", () => {
    expect(byDim({ ...finding, ai })).toEqual({ bug_recall: 4, precision: 4, severity: 4, ai_use: 3 });
    expect(byDim({ ...finding, recall: 0.6, precision: 0.65, severityCalibration: 0.6, ai })).toMatchObject({ bug_recall: 3, precision: 3, severity: 3 });
    expect(byDim({ ...finding, recall: 0.3, precision: 0.4, severityCalibration: 0.4, ai })).toMatchObject({ bug_recall: 2, precision: 2, severity: 2 });
    expect(byDim({ ...finding, recall: 0.1, precision: 0.1, severityCalibration: 0.1, ai })).toMatchObject({ bug_recall: 1, precision: 1, severity: 1 });
  });

  it("scores nothing it can't measure", () => {
    const none = byDim({ ...finding, findings: 0, matched: 0, ai: { ...ai, queries: 0 } });
    expect(none).toEqual({ bug_recall: 4, precision: 1 });
  });
});

describe("decisionScore and autoReviewScores", () => {
  it("compares the call with the right one", () => {
    expect(decisionScore("reject", "reject")).toBe(4);
    expect(decisionScore("reject", "request_changes")).toBe(3);
    expect(decisionScore("request_changes", "approve")).toBe(2);
    expect(decisionScore("reject", "approve")).toBe(1);
    expect(decisionScore("approve", "request_changes")).toBe(2);
  });

  const m = { ...finding, correct: "request_changes" as const, given: "request_changes" as const, fix: null };
  it("scores the decision, the fix, and ignores recall on a correct PR", () => {
    const dims = (x: Parameters<typeof autoReviewScores>[0]) => Object.fromEntries(autoReviewScores(x).map((s) => [s.dimension, s.score]));
    expect(dims(m)).toEqual({ recall: 4, precision: 4, decision: 4 });
    expect(dims({ ...m, given: null }).decision).toBe(1);
    expect(dims({ ...m, fix: { passed: 3, total: 4 } }).fix).toBe(3);
    expect(dims({ ...m, fix: { passed: 1, total: 4 } }).fix).toBe(1);
    const clean = dims({ ...m, correct: "approve", given: "approve", planted: 0, matched: 0, findings: 2, precision: 0.3 });
    expect(clean).toEqual({ precision: 1, decision: 4 });
  });
});

describe("autoExtensionScores", () => {
  const m = { acceptance: { passed: 5, total: 5 }, regression: { passed: 10, total: 10 }, solved: true, submissions: 2, minutesToSolve: 20, minutesTotal: 45, ai, runs: 3 };
  const dims = (x: Parameters<typeof autoExtensionScores>[0]) => Object.fromEntries(autoExtensionScores(x).map((s) => [s.dimension, s.score]));

  it("bands acceptance, regression and time", () => {
    expect(dims(m)).toEqual({ acceptance: 4, regression: 4, verification: 3, time: 4 });
    expect(dims({ ...m, acceptance: { passed: 4, total: 5 }, regression: { passed: 9, total: 10 }, minutesToSolve: 35 })).toMatchObject({ acceptance: 3, regression: 3, time: 3 });
    expect(dims({ ...m, acceptance: { passed: 2, total: 5 }, regression: { passed: 7, total: 10 }, minutesToSolve: 44 })).toMatchObject({ acceptance: 2, regression: 2, time: 2 });
    expect(dims({ ...m, acceptance: null, regression: null, minutesToSolve: null, solved: false })).toMatchObject({ acceptance: 1, regression: 1, time: 1 });
  });

  it("judges verification from tests run after applying assistant code", () => {
    const noAi = { ...ai, queries: 0, applies: 0, appliesVerified: 0, hunksAccepted: 0 };
    expect(dims({ ...m, ai: noAi, runs: 0 }).verification).toBe(1);
    expect(dims({ ...m, ai: { ...noAi, ownTests: true }, runs: 2 }).verification).toBe(3);
    expect(dims({ ...m, ai: { ...ai, appliesVerified: 0 }, runs: 0 }).verification).toBe(1);
    expect(dims({ ...m, ai: { ...ai, mutationsInjected: 1, mutationsCaught: 0 } }).verification).toBe(2);
  });
});
