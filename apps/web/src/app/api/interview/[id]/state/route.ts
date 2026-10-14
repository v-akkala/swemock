import { resolveAi } from "@/server/ai/config";
import { sessionUsage } from "@/server/ai/usage";
import { handle } from "@/server/http/errors";
import { getLldPrivate } from "@/server/content/lld";
import { sessionEvents } from "@/server/dsa/store";
import { chatMessages, settleInterview } from "@/server/interview/engine";

export const dynamic = "force-dynamic";

/** Polled by the interview page: clock, phase, and chat messages after `after` (epoch ms). */
export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
    const now = Date.now();
    const { session, state } = settleInterview(id, now);
    const phase = state.phases[state.phaseIndex]!;
    const usage = sessionUsage(id);
    const round = state.round;
    return Response.json({
      status: session.status,
      serverNow: now,
      startedAt: session.startedAt,
      deadline: state.deadline,
      phases: state.phases,
      phaseIndex: state.phaseIndex,
      phaseEndsAt: state.phaseStartedAt + phase.minutes * 60_000,
      driver: session.driver,
      liveVia: state.liveVia,
      messages: chatMessages(id, after),
      usage: { total: usage.total, cap: usage.cap },
      aiConnected: resolveAi().connected,
      roundType: session.roundType,
      // Recruiter screen: the question waiting for the candidate's self-grade, if any.
      change: round?.kind === "lld" && sessionEvents(id, "requirement_change").length ? (getLldPrivate(round.slug)?.changeMd ?? null) : null,
      pendingGrade: round?.kind === "recruiter" ? round.pending : null,
    });
  });
}
