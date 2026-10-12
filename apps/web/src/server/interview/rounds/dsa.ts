import "server-only";
import { getDsaPrivate } from "../../content/repo";
import type { SessionRow } from "../../dsa/store";
import { say } from "../chat";
import { totalMinutes } from "../phases";
import type { InterviewState } from "../state";
import { scriptSections } from "./script";
import type { Round, RoundCtx } from "./types";

const SCRIPT_PATH = "interviewer/dsa-scripted.md";

/** Lines per phase from prompts/interviewer/dsa-scripted.md ("## phase" headings, "- line" items). */
export function scriptedLines(minutes: number): { lines: Record<string, string[]>; versionTag: string } {
  return scriptSections(SCRIPT_PATH, { minutes: String(minutes) });
}

/** Problem follow-ups lead the "test" phase; the generic testing questions come after. */
function linesFor(session: SessionRow, phaseId: string, state: InterviewState): string[] {
  const base = scriptedLines(totalMinutes(state.phases)).lines[phaseId] ?? [];
  if (phaseId !== "test" || !session.itemId) return base;
  const slug = session.itemId.split(":")[1]!;
  return [...(getDsaPrivate(slug)?.followups ?? []), ...base];
}

/** The scripted interviewer's next line in the current phase, if it has one left. */
function scriptedNext(ctx: RoundCtx, at = ctx.now): boolean {
  const { session, state } = ctx;
  const phase = state.phases[state.phaseIndex]!;
  const lines = linesFor(session, phase.id, state);
  const used = state.scriptUsed[phase.id] ?? 0;
  if (used >= lines.length) return false;
  state.scriptUsed[phase.id] = used + 1;
  say(session, state, "interviewer", lines[used]!, at);
  return true;
}

export const dsaRound: Round = {
  // Both drivers open with the scripted greeting: instant, and the AI takes over from the first reply.
  opening: (ctx) => void scriptedNext(ctx),
  onPhaseStart: (ctx) => {
    if (ctx.scripted) scriptedNext(ctx);
  },
  // One millisecond later so the reply sorts after the candidate's message (ULIDs aren't ordered within a ms).
  onCandidate: (ctx) => void scriptedNext(ctx),
};
