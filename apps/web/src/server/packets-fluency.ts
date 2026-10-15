import "server-only";
import type { MatchResult } from "@swemock/shared";
import { exampleGrade, rubricForRound, type Rubric } from "@swemock/shared/scoring";
import type { FluencyType } from "@/lib/fluency-types";
import { getFluency, parseItemId } from "./content/fluency";
import { sessionEvents, type SessionRow } from "./dsa/store";
import { ApiError } from "./http/errors";
import { settleInterview } from "./interview/engine";
import { phasePlanText, totalMinutes } from "./interview/phases";
import { readState } from "./interview/state";
import { describeHidden, describeVisible, ROUND_NAME, ROUND_RULES } from "./fluency/describe";
import { foldFindings } from "./fluency/findings";
import { finalFiles, mutationReports, reviewFindings } from "./fluency/metrics";
import { startingFiles } from "./fluency/service";
import { transcriptOf } from "./packets-conversation";
import { rubricText, stamp, type Packet } from "./packet-util";
import { loadTemplate, render } from "./prompts/templates";
import { loadScorecard } from "./scoring/scorecard";

export function fluencyLive(session: SessionRow): Packet {
  const { session: s, state } = settleInterview(session.id);
  if (s.status !== "active") throw new ApiError(409, "This interview has ended; use the grading packet instead.");
  const { type, slug } = parseItemId(s.itemId!);
  const t = loadTemplate("packets/fluency-live.md");
  const markdown = render(t.body, {
    round_name: ROUND_NAME[type],
    round_rules: ROUND_RULES[type],
    phase_plan: `${phasePlanText(state.phases)}\n(${totalMinutes(state.phases)} minutes in total)`,
    visible: describeVisible(type, slug),
  });
  return { kind: "fluency-live", markdown, filename: `swemock-${type}-${slug}.md`, versionTag: t.versionTag, sessionId: s.id };
}

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function assistantLog(s: SessionRow): string {
  const events = sessionEvents<Record<string, unknown>>(s.id);
  const prompts = events.filter((e) => e.kind === "assistant_prompt");
  if (!prompts.length) return "(The assistant was not used.)";
  return prompts
    .map((p) => {
      const id = p.payload.promptId;
      const ctx = (p.payload.context as { path: string; from?: number; to?: number }[]).map((c) => `${c.path}${c.from ? `:${c.from}-${c.to ?? c.from}` : ""}`).join(", ") || "nothing";
      const resp = events.find((e) => e.kind === "assistant_response" && e.payload.promptId === id);
      const applied = events.filter((e) => e.kind === "assistant_apply" && String(e.payload.proposalId).startsWith(`${id}-`));
      return [
        `[${stamp(s, p.ts)}] Candidate asked (${p.payload.via}): ${trim(String(p.payload.question), 1500)}`,
        `  Attached: ${ctx}`,
        resp ? `  Reply: ${trim(String(resp.payload.reply), 1500)}` : "  (no reply recorded)",
        applied.length ? `  Applied: ${applied.map((a) => `${a.payload.path}: ${(a.payload.accepted as string[]).length} hunk(s) accepted, ${(a.payload.rejected as string[]).length} rejected`).join("; ")}` : "  Applied: nothing",
      ].join("\n");
    })
    .join("\n\n");
}

function work(s: SessionRow, type: FluencyType, slug: string): string {
  const folded = foldFindings(s.id);
  if (type === "extension") {
    const start = startingFiles(type, getFluency(type, slug)!.pub);
    const final = finalFiles(s) ?? {};
    const changed = Object.keys(final).filter((p) => final[p] !== start[p]);
    return changed.length ? changed.map((p) => `**${p}**\n\`\`\`\n${trim(final[p]!, 6000)}\n\`\`\``).join("\n\n") : "(no files were changed)";
  }
  const review = reviewFindings(s)!;
  const m: MatchResult = review.match;
  const line = (f: { id: string; file: string; lines: [number, number]; category: string; severity: string }) => {
    const text = folded.findings.find((x) => x.id === f.id)?.text ?? "";
    const hit = m.matches.find((x) => x.findingId === f.id);
    const verdict = hit ? `matches planted ${hit.plantedId}${hit.confirmed ? " (confirmed by the candidate)" : ""}` : m.borderline.some((b) => b.findingId === f.id) ? "borderline (right place, different category)" : m.acceptable.includes(f.id) ? "an acceptable finding" : "no match: a false positive";
    return `- ${f.file}:${f.lines[0]}-${f.lines[1]} [${f.category}, ${f.severity}] ${trim(text, 400)} → ${verdict}`;
  };
  return [
    type === "comprehension" ? `Summary written by the candidate:\n${folded.summary.trim() || "(none)"}` : `Final decision: ${folded.decision ? `${folded.decision.value.replace("_", " ")}. ${trim(folded.decision.summary, 800)}` : "(none)"}`,
    "",
    "Findings:",
    ...(review.findings.length ? review.findings.map(line) : ["(none)"]),
    `Missed planted issues: ${m.missed.join(", ") || "none"}`,
  ].join("\n");
}

export function fluencyGrading(session: SessionRow): { packet: Packet; rubric: Rubric } {
  const s = session.mode === "interview" ? settleInterview(session.id).session : session;
  if (s.status === "active") throw new ApiError(409, "The grading packet is available after the round ends.");
  const { type, slug } = parseItemId(s.itemId!);
  const rubric = rubricForRound(type);
  const card = loadScorecard(s.id);
  const reports = mutationReports(s);
  const t = loadTemplate("packets/fluency-grading.md");
  const timeline = sessionEvents<Record<string, unknown>>(s.id)
    .filter((e) => ["phase_change", "run", "submit"].includes(e.kind))
    .map((e) => (e.kind === "phase_change" ? `[${stamp(s, e.ts)}] phase → ${e.payload.to}` : `[${stamp(s, e.ts)}] ${e.kind}: ${String(e.payload.verdict).replace(/_/g, " ")}, ${e.payload.passed}/${e.payload.total}`))
    .join("\n");
  const markdown = render(t.body, {
    round_name: ROUND_NAME[type],
    rubric: rubricText(rubric),
    dimension_ids: rubric.dimensions.map((d) => d.id).join(", "),
    visible: describeVisible(type, slug),
    hidden: describeHidden(type, slug),
    metrics: [`- Duration: ${Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 60_000)} min; interviewer: ${s.driver === "llm" ? "AI" : readState(s).liveVia === "packet" ? "external chat" : s.mode === "interview" ? "scripted" : "none (practice)"}`, ...card.metricLines.map((l) => `- ${l}`)].join("\n"),
    work: work(s, type, slug),
    assistant_log: assistantLog(s),
    mutations: reports.length ? reports.map((r) => `- ${r.path}:${r.line} (${r.op}) \`${r.before.trim()}\` → \`${r.after.trim()}\`: ${r.caught ? `caught (${r.how})` : "NOT caught"}`).join("\n") : "(fallible mode was off, or no reply was mutated)",
    timeline: timeline || "(no events)",
    transcript: s.mode === "interview" ? transcriptOf(s, "fluency-live") : "(practice session: no interviewer chat)",
    example: JSON.stringify(exampleGrade(rubric), null, 2),
  });
  return { packet: { kind: "fluency-grading", markdown, filename: `swemock-${type}-grading-${slug}.md`, versionTag: t.versionTag, sessionId: s.id }, rubric };
}
