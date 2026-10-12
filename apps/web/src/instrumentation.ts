/** Runs once at server start: back up the database and apply migrations before serving requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDb } = await import("@/server/db");
    getDb();
    const { ensureContentSynced } = await import("@/server/content/sync");
    ensureContentSynced({ force: true });
  }
}
