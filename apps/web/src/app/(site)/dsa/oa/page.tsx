import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/server/db";
import { sessions } from "@/server/db/schema";
import { OA_MIXES, oaResults, settleOa } from "@/server/dsa/oa";
import { OaSetup } from "./oa-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Online assessment · swemock" };

export default function OaPage() {
  const recent = getDb()
    .select()
    .from(sessions)
    .where(and(eq(sessions.mode, "oa")))
    .orderBy(desc(sessions.startedAt))
    .limit(8)
    .all()
    .map((s) => settleOa(s));

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Online assessment</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Two problems against one clock, like a hiring-platform coding test. No hints, no interviewer. You get partial credit for the
          share of tests your best submission passes. The clock keeps running if you close the tab.
        </p>
      </div>
      <OaSetup mixes={Object.keys(OA_MIXES)} />
      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="mb-2 font-semibold">
            Recent assessments
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="recent-oa">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/dsa/oa/${s.id}`} className="hover:bg-muted flex items-center justify-between px-4 py-2 text-sm">
                  <span>{new Date(s.startedAt).toLocaleString()}</span>
                  <span className="text-muted-foreground">
                    {s.status === "active" ? "In progress" : `Score ${oaResults(s).score}%`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
