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

/**
 * Where the version-controlled content lives. `/content` in Docker (bind-mounted from the repo, with a
 * copy baked into the image as a fallback); in development, the repo's `content/` next to `apps/`.
 */
export function contentDir(): string {
  if (process.env.SWEMOCK_CONTENT_DIR) return path.resolve(/*turbopackIgnore: true*/ process.env.SWEMOCK_CONTENT_DIR);
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../../content");
}

/** Versioned prompt and packet templates (`prompts/` in the repo, `/prompts` in Docker). */
export function promptsDir(): string {
  if (process.env.SWEMOCK_PROMPTS_DIR) return path.resolve(/*turbopackIgnore: true*/ process.env.SWEMOCK_PROMPTS_DIR);
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../../prompts");
}
