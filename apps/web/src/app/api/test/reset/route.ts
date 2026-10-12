import { DEFAULT_SETTINGS } from "@swemock/shared";
import { testMode } from "@/server/ai/config";
import { getDb } from "@/server/db";
import * as t from "@/server/db/schema";
import { updateSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/**
 * Wipes user data so end-to-end runs don't depend on earlier runs. Only exists in test mode
 * (SWEMOCK_TEST_MODE=1); otherwise it's a 404 like any unknown route.
 */
export function POST() {
  if (!testMode()) return Response.json({ error: "Not found" }, { status: 404 });
  const db = getDb();
  db.transaction((tx) => {
    // Children before parents (foreign keys).
    for (const table of [t.events, t.scorecards, t.submissions, t.drafts, t.srsCards, t.tokenUsage, t.loopRounds, t.sessions, t.loops, t.stories, t.resumes, t.secrets]) {
      tx.delete(table).run();
    }
  });
  updateSettings(db, { ...DEFAULT_SETTINGS, onboardingDone: true });
  return Response.json({ ok: true });
}
