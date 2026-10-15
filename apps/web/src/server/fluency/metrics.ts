import "server-only";
import {
  autoComprehensionScores,
  autoExtensionScores,
  autoReviewScores,
  type AiUse,
  type ComprehensionMetrics,
  type ExtensionMetrics,
  type ReviewMetrics,
  type SourcedScore,
} from "@swemock/shared/scoring";
import { computeHunks, matchFindings, type Finding, type MatchResult, type Planted } from "@swemock/shared";
import { getFluency, getFluencyPrivate, parseItemId } from "../content/fluency";
import { sessionEvents, type SessionRow } from "../dsa/store";
import { latestLldFiles, loadLldDrafts } from "../lld/store";
import { foldFindings } from "./findings";
import { startingFiles } from "./service";

type Files = Record<string, string>;

/** The candidate's files at the end: the last saved workspace of this session. */
export function finalFiles(session: SessionRow): Files | null {
  const { type, slug } = parseItemId(session.itemId!);
  const pub = getFluency(type, slug);
  if (!pub) return null;
  if (session.mode === "interview") return latestLldFiles(session.id)?.files ?? lastEventFiles(session);
  return loadLldDrafts(session.itemId!, null)[pub.pub.language] ?? lastEventFiles(session);
}

function lastEventFiles(session: SessionRow): Files | null {
  const e = [...sessionEvents<{ files?: Files }>(session.id)].reverse().find((x) => x.payload.files);
  return e?.payload.files ?? null;
}

interface Mutation {
  promptId: string;
  proposalId: string;
  path: string;
  op: string;
  line: number;
  before: string;
  after: string;
}

export interface MutationReport extends Mutation {
  caught: boolean;
  how: "rejected" | "fixed" | "missed";
}

/** Each injected mutation and whether the candidate caught it: rejected that hunk, or fixed those lines. */
export function mutationReports(session: SessionRow): MutationReport[] {
  const final = finalFiles(session) ?? {};
  const responses = sessionEvents<{ promptId: string; proposals: { id: string; path: string; base: string; newContent: string }[] }>(session.id, "assistant_response");
  const applies = sessionEvents<{ proposalId: string; path: string; accepted: string[] }>(session.id, "assistant_apply");
  return sessionEvents<Mutation>(session.id, "mutation_injected").map((e) => {
    const m = e.payload;
    const proposal = responses.find((r) => r.payload.promptId === m.promptId)?.payload.proposals.find((p) => p.id === m.proposalId);
    const hunks = proposal ? computeHunks(proposal.base, proposal.newContent) : [];
    const hunk = hunks.find((h) => h.newLines.some((l) => l.trim() === m.after.trim())) ?? hunks.find((h) => h.newLines.length || h.oldLines.length);
    const acceptedEver = applies.some((a) => a.payload.proposalId === m.proposalId && hunk && a.payload.accepted.includes(hunk.id));
    const text = final[m.path] ?? "";
    const has = (line: string) => line.trim() !== "" && text.split("\n").some((l) => l.trim() === line.trim());
    if (!acceptedEver) return { ...m, caught: true, how: "rejected" as const };
    const fixed = has(m.before) || !has(m.after);
    return { ...m, caught: fixed, how: fixed ? ("fixed" as const) : ("missed" as const) };
  });
}

export function aiUse(session: SessionRow): AiUse {
  const events = sessionEvents<Record<string, unknown>>(session.id);
  const applies = events.filter((e) => e.kind === "assistant_apply" && (e.payload.accepted as string[]).length > 0);
  const checks = events.filter((e) => e.kind === "run" || e.kind === "submit").map((e) => e.ts);
  let verified = 0;
  applies.forEach((a, i) => {
    const next = applies[i + 1]?.ts ?? Infinity;
    if (checks.some((t) => t > a.ts && t < next)) verified++;
  });
  const { type, slug } = parseItemId(session.itemId!);
  const pub = getFluency(type, slug)?.pub;
  const start = pub ? startingFiles(type, pub) : {};
  const final = finalFiles(session) ?? {};
  const ownTests = Object.entries(final).some(([p, t]) => p.startsWith("tests/") && !p.startsWith("tests/hidden") && start[p] !== t);
  const reports = mutationReports(session);
  const apply = (k: "accepted" | "rejected") => events.filter((e) => e.kind === "assistant_apply").reduce((n, e) => n + (e.payload[k] as string[]).length, 0);
  return {
    queries: events.filter((e) => e.kind === "assistant_prompt").length,
    applies: applies.length,
    hunksAccepted: apply("accepted"),
    hunksRejected: apply("rejected"),
    appliesVerified: verified,
    ownTests,
    mutationsInjected: reports.length,
    mutationsCaught: reports.filter((r) => r.caught).length,
  };
}

export interface FindingReview {
  match: MatchResult;
  planted: Planted[];
  findings: Finding[];
}

export function reviewFindings(session: SessionRow): FindingReview | null {
  const { type, slug } = parseItemId(session.itemId!);
  if (type === "extension") return null;
  const priv = getFluencyPrivate(type, slug);
  if (!priv) return null;
  const folded = foldFindings(session.id);
  const issues = type === "comprehension" ? (priv as { manifest: { bugs: Planted[] & { lines: [number, number] }[] } }).manifest.bugs : (priv as { issues: Planted[] }).issues;
  const acceptable = type === "comprehension" ? (priv as { manifest: { acceptable: { file: string; lines: [number, number]; category?: string }[] } }).manifest.acceptable : (priv as { acceptable: { file: string; lines: [number, number]; category?: string }[] }).acceptable;
  const planted: Planted[] = issues.map((i) => ({ id: i.id, file: i.file, lines: i.lines, category: i.category, severity: i.severity }));
  const findings: Finding[] = folded.findings.map((f) => ({ id: f.id, file: f.file, lines: f.lines, category: f.category, severity: f.severity }));
  return { match: matchFindings(findings, planted, acceptable, folded.matchDecisions), planted, findings };
}

function bestCounts(session: SessionRow, key: string): { passed: number; total: number } | null {
  let best: { passed: number; total: number } | null = null;
  for (const e of sessionEvents<{ counts?: Record<string, { passed: number; total: number }> }>(session.id, "submit")) {
    const c = e.payload.counts?.[key];
    if (c && c.total > 0 && (!best || c.passed / c.total >= best.passed / best.total)) best = c;
  }
  return best;
}

export interface FluencyAuto {
  scores: SourcedScore[];
  lines: string[];
  comprehension?: ComprehensionMetrics;
  review?: ReviewMetrics;
  extension?: ExtensionMetrics;
}

/** Objective scores and the metric lines for the three AI Fluency rounds. */
export function fluencyAuto(session: SessionRow): FluencyAuto {
  const { type, slug } = parseItemId(session.itemId!);
  const ai = aiUse(session);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const aiLine = ai.queries ? `Assistant: ${ai.queries} question(s), ${ai.applies} applied (${ai.hunksAccepted} hunks accepted, ${ai.hunksRejected} rejected), code run after ${ai.appliesVerified}` : "Assistant: not used";
  const mutLine = ai.mutationsInjected ? `Injected mistakes caught: ${ai.mutationsCaught} of ${ai.mutationsInjected}` : null;

  if (type === "extension") {
    const events = sessionEvents<{ verdict?: string }>(session.id);
    const solvedAt = events.find((e) => e.kind === "submit" && e.payload.verdict === "accepted");
    const pub = getFluency("extension", slug)!.pub;
    const m: ExtensionMetrics = {
      acceptance: bestCounts(session, "acceptance"),
      regression: bestCounts(session, "regression"),
      solved: Boolean(solvedAt),
      submissions: events.filter((e) => e.kind === "submit").length,
      minutesToSolve: solvedAt ? Math.round((solvedAt.ts - session.startedAt) / 6000) / 10 : null,
      minutesTotal: pub.minutes,
      ai,
      runs: events.filter((e) => e.kind === "run").length,
    };
    return {
      scores: autoExtensionScores(m),
      lines: [
        m.acceptance ? `Acceptance tests: ${m.acceptance.passed}/${m.acceptance.total}` : "No submission",
        m.regression ? `Existing tests: ${m.regression.passed}/${m.regression.total}` : "Existing tests: not submitted",
        m.solved ? `All tests passed after ${m.minutesToSolve} of ${m.minutesTotal} min` : "Never reached a fully passing submission",
        `Test runs: ${m.runs}; submissions: ${m.submissions}`,
        aiLine,
        ...(mutLine ? [mutLine] : []),
      ],
      extension: m,
    };
  }

  const review = reviewFindings(session)!;
  const folded = foldFindings(session.id);
  const matched = review.match.matches.length;
  const base = { findings: review.findings.length, planted: review.planted.length, recall: review.match.recall, precision: review.match.precision, severityCalibration: review.match.severityCalibration, matched };
  const common = [
    `Findings: ${base.findings}; planted issues found: ${matched} of ${base.planted}${review.match.borderline.length ? ` (${review.match.borderline.length} borderline match(es) to confirm in the debrief)` : ""}`,
    `Recall ${pct(base.recall)}, precision ${pct(base.precision)}`,
    aiLine,
    ...(mutLine ? [mutLine] : []),
  ];
  if (type === "comprehension") {
    const m: ComprehensionMetrics = { ...base, ai };
    return { scores: autoComprehensionScores(m), lines: [...common, `Summary: ${folded.summary.trim() ? `${folded.summary.trim().split(/\s+/).length} words` : "none written"}`], comprehension: m };
  }
  const priv = getFluencyPrivate("review", slug)!;
  const fix = bestCounts(session, "regression");
  const m: ReviewMetrics = { ...base, correct: priv.decision, given: folded.decision?.value ?? null, fix };
  return {
    scores: autoReviewScores(m),
    lines: [`Decision: ${folded.decision ? folded.decision.value.replace("_", " ") : "none"}`, ...common, fix ? `Fix attempt: ${fix.passed}/${fix.total} hidden tests` : "No fix attempted"],
    review: m,
  };
}
