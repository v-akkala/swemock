/**
 * Matching a user's findings (gutter annotations or PR comments) against the planted issues (spec §8.4.1):
 * a finding matches when it is in the same file, its line range overlaps the planted range (±2 lines), and
 * the category agrees. Overlap with a different category is "borderline": the user confirms or rejects it in
 * the debrief. A finding that matches an acceptable (real but unplanted) issue doesn't count against precision.
 */
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
/** Categories for findings: planted issues and users' annotations share them (closed, so matching is exact). */
export const FINDING_CATEGORIES = [
  "off-by-one",
  "boundary",
  "mutable-default",
  "race-condition",
  "overflow",
  "stale-cache",
  "resource-leak",
  "swallowed-error",
  "time-handling",
  "float-precision",
  "performance",
  "logic-error",
  "missing-validation",
  "security",
  "missed-edge-case",
  "hollow-test",
  "hallucinated-api",
  "scope-creep",
  "description-mismatch",
  "design",
  "style",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export const LINE_SLACK = 2;

export interface Located {
  id: string;
  file: string;
  /** Inclusive, 1-based. */
  lines: [number, number];
  category: string;
}

export interface Planted extends Located {
  severity: Severity;
}

export interface Finding extends Located {
  severity: Severity;
}

export interface MatchResult {
  /** finding → planted issue it matches (each planted issue is matched by at most one finding). */
  matches: { findingId: string; plantedId: string; confirmed: boolean }[];
  /** Overlapping but a different category, not yet decided. */
  borderline: { findingId: string; plantedId: string }[];
  /** Findings that hit an acceptable issue (not planted, but real). */
  acceptable: string[];
  falsePositives: string[];
  missed: string[];
  /** Severity-weighted share of planted issues found (weights 1–4). */
  recall: number;
  /** (matched + acceptable) over all findings; 1 when there are no findings and nothing was planted. */
  precision: number;
  /** 1 when every matched finding carries the planted severity, down to 0 when they are 3 levels off. */
  severityCalibration: number;
}

const rank = (s: Severity) => SEVERITIES.indexOf(s) + 1;

export function overlaps(a: [number, number], b: [number, number], slack = LINE_SLACK): boolean {
  return a[0] <= b[1] + slack && b[0] <= a[1] + slack;
}

const near = (f: Located, p: { file: string; lines: [number, number] }) => f.file === p.file && overlaps(f.lines, p.lines);

/**
 * `decisions` maps a borderline finding id to the planted id the user confirmed it matches, or `false`
 * if they rejected it (it then counts as a false positive).
 */
export function matchFindings(
  findings: Finding[],
  planted: Planted[],
  acceptable: { file: string; lines: [number, number]; category?: string }[] = [],
  decisions: Record<string, string | false> = {},
): MatchResult {
  const taken = new Set<string>();
  const matches: MatchResult["matches"] = [];
  const borderline: MatchResult["borderline"] = [];
  const acceptableHits: string[] = [];
  const falsePositives: string[] = [];

  for (const f of findings) {
    const candidates = planted.filter((p) => near(f, p));
    const exact = candidates.filter((p) => p.category === f.category && !taken.has(p.id));
    if (exact.length) {
      // The closest planted issue by line distance.
      const best = exact.sort((x, y) => Math.abs(x.lines[0] - f.lines[0]) - Math.abs(y.lines[0] - f.lines[0]))[0]!;
      taken.add(best.id);
      matches.push({ findingId: f.id, plantedId: best.id, confirmed: false });
      continue;
    }
    const decided = decisions[f.id];
    if (decided === false) {
      falsePositives.push(f.id);
      continue;
    }
    if (typeof decided === "string" && !taken.has(decided) && planted.some((p) => p.id === decided)) {
      taken.add(decided);
      matches.push({ findingId: f.id, plantedId: decided, confirmed: true });
      continue;
    }
    const other = candidates.find((p) => !taken.has(p.id));
    if (other && decided === undefined) {
      borderline.push({ findingId: f.id, plantedId: other.id });
      continue;
    }
    if (acceptable.some((a) => near(f, a) && (!a.category || a.category === f.category))) acceptableHits.push(f.id);
    else falsePositives.push(f.id);
  }

  const matched = new Set(matches.map((m) => m.plantedId));
  const totalWeight = planted.reduce((n, p) => n + rank(p.severity), 0);
  const gotWeight = planted.filter((p) => matched.has(p.id)).reduce((n, p) => n + rank(p.severity), 0);
  const good = matches.length + acceptableHits.length;
  const offBy = matches.map((m) => Math.abs(rank(findings.find((f) => f.id === m.findingId)!.severity) - rank(planted.find((p) => p.id === m.plantedId)!.severity)));
  return {
    matches,
    borderline,
    acceptable: acceptableHits,
    falsePositives,
    missed: planted.filter((p) => !matched.has(p.id)).map((p) => p.id),
    recall: totalWeight ? gotWeight / totalWeight : 1,
    precision: findings.length ? good / findings.length : planted.length ? 0 : 1,
    severityCalibration: offBy.length ? 1 - offBy.reduce((a, b) => a + b, 0) / offBy.length / 3 : 0,
  };
}
