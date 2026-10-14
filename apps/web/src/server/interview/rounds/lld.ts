import "server-only";
import { getLld, getLldPrivate } from "../../content/lld";
import { addEvent, type SessionRow } from "../../dsa/store";
import { ApiError } from "../../http/errors";
import { say } from "../chat";
import { lldPhases, totalMinutes } from "../phases";
import { createInterview } from "../session";
import type { InterviewState } from "../state";
import { scriptSections } from "./script";
import type { Round, RoundCtx } from "./types";

const SCRIPT = "interviewer/lld-scripted.md";

const slugOf = (session: SessionRow) => session.itemId!.split(":")[1]!;

/** Phase lines from prompts/interviewer/lld-scripted.md; the problem's follow-ups lead the wrap-up. */
function linesFor(session: SessionRow, state: InterviewState, phaseId: string): string[] {
  const base = scriptSections(SCRIPT, { minutes: String(totalMinutes(state.phases)) }).lines[phaseId] ?? [];
  if (phaseId !== "wrapup") return base;
  return [...(getLldPrivate(slugOf(session))?.followups ?? []), ...base];
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

export const lldRound: Round = {
  opening: (ctx) => void scriptedNext(ctx),

  onPhaseStart(ctx, phaseId) {
    if (phaseId === "change") {
      // The authored requirement change is introduced by the app for both drivers, word for word, and it
      // unlocks the extension tests (spec §8.3).
      const priv = getLldPrivate(slugOf(ctx.session))!;
      addEvent(ctx.session.id, "requirement_change", { slug: slugOf(ctx.session), source: "interview" }, ctx.now);
      say(ctx.session, ctx.state, "interviewer", `New requirement: ${priv.changeMd.trim()}`, ctx.now);
      if (ctx.scripted) scriptedNext({ ...ctx, now: ctx.now + 1 });
    } else if (ctx.scripted) scriptedNext(ctx);
  },

  onCandidate: (ctx) => void scriptedNext(ctx),
};

export function startLldInterview(opts: { slug: string; driver: "scripted" | "llm"; liveVia: "app" | "packet"; now?: number }): SessionRow {
  const now = opts.now ?? Date.now();
  const problem = getLld(opts.slug);
  if (!problem) throw new ApiError(404, "That problem doesn't exist.");
  return createInterview({
    roundType: "lld",
    itemId: problem.id,
    phases: lldPhases(problem.pub.minutes),
    driver: opts.driver,
    liveVia: opts.liveVia,
    round: { kind: "lld", slug: opts.slug },
    now,
    opening: (session, state) => lldRound.opening({ session, state, now, scripted: opts.driver === "scripted", advance: () => undefined }),
  });
}
