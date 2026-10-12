import "server-only";
import path from "node:path";

// The turbopackIgnore hints stop Next's file tracer from copying the whole project into the build;
// both paths are resolved at runtime.

/** Directory for SQLite, backups, keys. `/data` in Docker (the swemock-data volume). */
export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.SWEMOCK_DATA_DIR ?? path.join(process.cwd(), ".data"));
}

/** Checked-in Drizzle migrations; shipped next to server.js in the standalone build. */
export function migrationsDir(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.SWEMOCK_MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle"),
  );
}
