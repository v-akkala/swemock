import "server-only";
import { getFluency, getFluencyPrivate, parseItemId } from "../../content/fluency";
import type { SessionRow } from "../../dsa/store";
import { ApiError } from "../../http/errors";
import { say } from "../chat";
import { fluencyPhases, totalMinutes } from "../phases";
import { createInterview } from "../session";
import type { InterviewState } from "../state";
import { scriptSections } from "./script";
import type { Round, RoundCtx } from "./types";
import type { FluencyType } from "@/lib/fluency-types";

const SCRIPTS: Record<FluencyType, string> = {
  comprehension: "interviewer/comprehension-scripted.md",
  review: "interviewer/review-scripted.md",
  extension: "interviewer/extension-scripted.md",
};

/** Phase lines from the round's script; the item's authored questions lead the discussion or wrap-up phase. */
function linesFor(session: SessionRow, state: InterviewState, phaseId: string): string[] {
  const { type, slug } = parseItemId(session.itemId!);
  const base = scriptSections(SCRIPTS[type], { minutes: String(totalMinutes(state.phases)) }).lines[phaseId] ?? [];
  const priv = getFluencyPrivate(type, slug);
  if (!priv) return base;
  if (type === "comprehension" && phaseId === "design") return [...(priv as { manifest: { questions: string[] } }).manifest.questions, ...base];
  if (type !== "comprehension" && phaseId === "wrapup") return [...(priv as { questions: string[] }).questions, ...base];
  if (type === "review" && phaseId === "decision") return [...(priv as { questions: string[] }).questions, ...base];
  return base;
}

function scriptedNext(ctx: RoundCtx): boolean {
  const { session, state } = ctx;
  const phase = state.phases[state.phaseIndex]!;
  const lines = linesFor(session, state, phase.id);
  const used = state.scriptUsed[phase.id] ?? 0;
  if (used >= lines.length) return false;
  state.scriptUsed[phase.id] = used + 1;
  say(session, state, "interviewer", lines[used]!, ctx.now);
  return true;
}

export const fluencyRound: Round = {
  opening: (ctx) => void scriptedNext(ctx),
  onPhaseStart: (ctx) => {
    if (ctx.scripted) scriptedNext(ctx);
  },
  onCandidate: (ctx) => void scriptedNext(ctx),
};

export function startFluencyInterview(opts: { type: FluencyType; slug: string; driver: "scripted" | "llm"; liveVia: "app" | "packet"; now?: number }): SessionRow {
  const now = opts.now ?? Date.now();
  const item = getFluency(opts.type, opts.slug);
  if (!item) throw new ApiError(404, "That item doesn't exist.");
  return createInterview({
    roundType: opts.type,
    itemId: item.id,
    phases: fluencyPhases(opts.type, item.pub.minutes),
    driver: opts.driver,
    liveVia: opts.liveVia,
    round: { kind: "fluency", type: opts.type, slug: opts.slug },
    now,
    packetNotice: "The conversation happens in the other chat. Copy the live packet to start; this page keeps time and runs your code.",
    opening: (session, state) => fluencyRound.opening({ session, state, now, scripted: opts.driver === "scripted", advance: () => undefined }),
  });
}
