import "server-only";
import { ulid } from "ulid";
import { FINDING_CATEGORIES, SEVERITIES } from "@swemock/shared";
import { z } from "zod";
import type { FindingView } from "@/lib/fluency-types";
import { addEvent, sessionEvents } from "../dsa/store";
import { ApiError } from "../http/errors";

/**
 * A user's findings (gutter annotations or PR comments), their summary, and their final decision live in
 * the append-only event log as `annotation` events and are folded into the current state when read. Every
 * change stays in the log for the replay.
 */
export const findingInput = z.object({
  file: z.string().min(1).max(120),
  lines: z.tuple([z.number().int().min(1), z.number().int().min(1)]).refine(([a, b]) => b >= a, "end line before start line"),
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(SEVERITIES),
  text: z.string().trim().max(2000).default(""),
});
export type FindingInput = z.infer<typeof findingInput>;

type Payload =
  | ({ type: "finding"; op: "add" | "edit"; id: string } & FindingInput)
  | { type: "finding"; op: "remove"; id: string }
  | { type: "summary"; text: string }
  | { type: "decision"; value: "approve" | "request_changes" | "reject"; summary: string }
  | { type: "match"; findingId: string; plantedId: string | false };

export interface FoldedState {
  findings: FindingView[];
  summary: string;
  decision: { value: "approve" | "request_changes" | "reject"; summary: string } | null;
  /** The user's calls on borderline matches (debrief). */
  matchDecisions: Record<string, string | false>;
}

export function foldFindings(sessionId: string): FoldedState {
  const findings = new Map<string, FindingView>();
  const out: FoldedState = { findings: [], summary: "", decision: null, matchDecisions: {} };
  for (const e of sessionEvents<Payload>(sessionId, "annotation")) {
    const p = e.payload;
    if (p.type === "finding") {
      if (p.op === "remove") findings.delete(p.id);
      else findings.set(p.id, { id: p.id, file: p.file, lines: p.lines, category: p.category, severity: p.severity, text: p.text });
    } else if (p.type === "summary") out.summary = p.text;
    else if (p.type === "decision") out.decision = { value: p.value, summary: p.summary };
    else if (p.type === "match") out.matchDecisions[p.findingId] = p.plantedId;
  }
  out.findings = [...findings.values()];
  return out;
}

export function addFinding(sessionId: string, input: FindingInput, now = Date.now()): FindingView {
  const id = ulid(now);
  addEvent(sessionId, "annotation", { type: "finding", op: "add", id, ...input }, now);
  return { id, ...input };
}

export function editFinding(sessionId: string, id: string, input: FindingInput): FindingView {
  if (!foldFindings(sessionId).findings.some((f) => f.id === id)) throw new ApiError(404, "That finding doesn't exist.");
  addEvent(sessionId, "annotation", { type: "finding", op: "edit", id, ...input });
  return { id, ...input };
}

export function removeFinding(sessionId: string, id: string): void {
  if (!foldFindings(sessionId).findings.some((f) => f.id === id)) throw new ApiError(404, "That finding doesn't exist.");
  addEvent(sessionId, "annotation", { type: "finding", op: "remove", id });
}

export const setSummary = (sessionId: string, text: string) => addEvent(sessionId, "annotation", { type: "summary", text: text.slice(0, 8000) });
export const setDecision = (sessionId: string, value: "approve" | "request_changes" | "reject", summary: string) =>
  addEvent(sessionId, "annotation", { type: "decision", value, summary: summary.slice(0, 4000) });
export const decideMatch = (sessionId: string, findingId: string, plantedId: string | false) => addEvent(sessionId, "annotation", { type: "match", findingId, plantedId });
