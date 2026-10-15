import Link from "next/link";
import { desc } from "drizzle-orm";
import { RECOMMENDATION_LABELS } from "@swemock/shared";
import { getDb } from "@/server/db";
import { contentItems, scorecards, sessions } from "@/server/db/schema";
import { oaResults, parseState, settleOa } from "@/server/dsa/oa";
import { sessionEvents } from "@/server/dsa/store";
import { settleInterview } from "@/server/interview/engine";
import { readState } from "@/server/interview/state";

export const dynamic = "force-dynamic";
export const metadata = { title: "History · swemock" };

export default function HistoryPage() {
  const db = getDb();
  const titles = new Map(db.select({ id: contentItems.id, title: contentItems.title }).from(contentItems).all().map((r) => [r.id, r.title]));
  const recs = new Map(db.select({ sessionId: scorecards.sessionId, rec: scorecards.recommendation }).from(scorecards).all().map((r) => [r.sessionId, r.rec]));
  const rows = db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.startedAt))
    .limit(200)
    .all()
    .map((raw) => {
      const s = raw.mode === "interview" ? settleInterview(raw.id).session : raw.mode === "oa" ? settleOa(raw) : raw;
      const submits = sessionEvents<{ verdict: string; passed: number; total: number }>(s.id, "submit");
      let result = "—";
      if (s.mode === "oa") result = s.status === "active" ? "In progress" : `Score ${oaResults(s).score}%`;
      else if (s.mode === "interview" && recs.get(s.id)) result = RECOMMENDATION_LABELS[recs.get(s.id) as keyof typeof RECOMMENDATION_LABELS];
      else if (submits.some((e) => e.payload.verdict === "accepted")) result = "Accepted";
      else if (submits.length) result = `${submits.at(-1)!.payload.verdict.replace(/_/g, " ")}`;
      const round = s.mode === "interview" ? readState(s).round : undefined;
      const problem = round?.kind === "recruiter" ? `Recruiter screen: ${round.config.role}${round.config.company ? ` at ${round.config.company}` : ""}`
        : round?.kind === "behavioral" ? `Behavioral: ${round.config.questionIds.length} questions`
        : s.mode === "oa" ? parseState(s).slugs.map((slug) => titles.get(`dsa:${slug}`) ?? slug).join(" + ") : titles.get(s.itemId ?? "") ?? "—";
      const href =
        s.status === "active"
          ? s.mode === "interview"
            ? `/interview/${s.id}`
            : s.mode === "oa"
              ? `/dsa/oa/${s.id}`
              : s.roundType === "lld"
                ? `/lld/${s.itemId?.split(":")[1]}`
                : ["comprehension", "review", "extension"].includes(s.roundType)
                  ? `/ai-fluency/${s.roundType}/${s.itemId?.split(":")[1]}`
                  : `/dsa/${s.itemId?.split(":")[1]}`
          : s.mode === "oa"
            ? `/dsa/oa/${s.id}`
            : `/debrief/${s.id}`;
      return { s, result, problem, href };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-muted-foreground mt-1 text-sm">Every session, newest first. Open one for its scorecard and a replay of what happened.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm">No sessions yet. Solve a problem or start a mock interview.</p>
      ) : (
        <table className="w-full text-left text-sm" data-testid="history">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1">When</th>
              <th>Type</th>
              <th>Problem or round</th>
              <th>Status</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, result, problem, href }) => (
              <tr key={s.id} className="border-t border-border">
                <td className="py-2">
                  <Link href={href} className="hover:underline">
                    {new Date(s.startedAt).toLocaleString()}
                  </Link>
                </td>
                <td>{s.mode === "interview" ? `Interview (${s.driver === "llm" ? "AI" : "scripted"})` : s.mode === "oa" ? "Online assessment" : "Practice"}</td>
                <td>{problem}</td>
                <td className="capitalize">{s.status}</td>
                <td>{result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
