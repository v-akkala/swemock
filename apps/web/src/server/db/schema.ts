import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Conventions: ids are ULIDs (text); timestamps are epoch milliseconds (integer);
// *_json columns hold JSON validated by Zod at the edges.

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at")
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => users.id);

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const secrets = sqliteTable("secrets", {
  name: text("name").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const resumes = sqliteTable("resumes", {
  id: id(),
  userId: userId(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  text: text("text").notNull(),
  source: text("source", { enum: ["paste", "pdf"] }).notNull(),
  parsedJson: text("parsed_json"),
  createdAt: createdAt(),
});

export const contentItems = sqliteTable(
  "content_items",
  {
    id: id(),
    type: text("type").notNull(),
    slug: text("slug").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    difficulty: text("difficulty"),
    tagsJson: text("tags_json").notNull().default("[]"),
    /** Safe to send to the browser. */
    publicJson: text("public_json").notNull(),
    /** Reference solutions, hidden tests, manifests, rubrics: never sent before the debrief. */
    privateJson: text("private_json").notNull(),
    source: text("source").notNull(),
    reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(false),
    contentHash: text("content_hash").notNull(),
    deletedAt: integer("deleted_at"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("content_items_type_slug").on(t.type, t.slug)],
);

export const loops = sqliteTable("loops", {
  id: id(),
  userId: userId(),
  presetId: text("preset_id"),
  title: text("title").notNull(),
  status: text("status", { enum: ["active", "completed", "abandoned"] }).notNull(),
  createdAt: createdAt(),
  completedAt: integer("completed_at"),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    userId: userId(),
    roundType: text("round_type").notNull(),
    itemId: text("item_id").references(() => contentItems.id),
    mode: text("mode", { enum: ["practice", "interview", "oa"] }).notNull(),
    driver: text("driver", { enum: ["scripted", "llm"] }).notNull(),
    provider: text("provider").notNull(),
    loopId: text("loop_id").references(() => loops.id),
    status: text("status", { enum: ["active", "ended", "abandoned"] }).notNull(),
    phasePlanJson: text("phase_plan_json").notNull().default("[]"),
    stateJson: text("state_json").notNull().default("{}"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_started").on(t.userId, t.startedAt)],
);

export const loopRounds = sqliteTable("loop_rounds", {
  id: id(),
  loopId: text("loop_id")
    .notNull()
    .references(() => loops.id),
  position: integer("position").notNull(),
  roundType: text("round_type").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  durationMin: integer("duration_min").notNull(),
  breakAfterMin: integer("break_after_min").notNull().default(0),
  sessionId: text("session_id").references(() => sessions.id),
});

export const EVENT_KINDS = [
  "chat",
  "code_snapshot",
  "run",
  "submit",
  "hint",
  "approach_check",
  "assistant_prompt",
  "assistant_response",
  "assistant_apply",
  "mutation_injected",
  "annotation",
  "whiteboard_snapshot",
  "phase_change",
  "packet_copied",
  "reply_pasted",
  "self_score",
] as const;

/** Append-only log; the source of truth for replay. */
export const events = sqliteTable(
  "events",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    ts: integer("ts").notNull(),
    kind: text("kind", { enum: EVENT_KINDS }).notNull(),
    payloadJson: text("payload_json").notNull(),
  },
  (t) => [index("events_session_ts").on(t.sessionId, t.ts)],
);

/** Autosave target: per session, or per (item, language) for practice drafts. */
export const drafts = sqliteTable(
  "drafts",
  {
    id: id(),
    userId: userId(),
    sessionId: text("session_id").references(() => sessions.id),
    itemId: text("item_id").references(() => contentItems.id),
    language: text("language"),
    filesJson: text("files_json").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("drafts_session").on(t.sessionId),
    index("drafts_item_lang").on(t.userId, t.itemId, t.language),
  ],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: id(),
    sessionId: text("session_id").references(() => sessions.id),
    userId: userId(),
    itemId: text("item_id").references(() => contentItems.id),
    language: text("language").notNull(),
    kind: text("kind", { enum: ["run", "submit"] }).notNull(),
    verdict: text("verdict").notNull(),
    passed: integer("passed").notNull(),
    total: integer("total").notNull(),
    resultsJson: text("results_json").notNull(),
    runtimeMs: real("runtime_ms"),
    memoryKb: integer("memory_kb"),
    createdAt: createdAt(),
  },
  (t) => [index("submissions_item").on(t.userId, t.itemId)],
);

export const scorecards = sqliteTable("scorecards", {
  id: id(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  dimensionsJson: text("dimensions_json").notNull(),
  recommendation: text("recommendation"),
  /** Model ID, "pasted", or "self". */
  grader: text("grader").notNull(),
  promptVersion: text("prompt_version"),
  formulaVersion: text("formula_version").notNull(),
  createdAt: createdAt(),
});

export const stories = sqliteTable("stories", {
  id: id(),
  userId: userId(),
  title: text("title").notNull(),
  situation: text("situation").notNull().default(""),
  task: text("task").notNull().default(""),
  action: text("action").notNull().default(""),
  result: text("result").notNull().default(""),
  metrics: text("metrics").notNull().default(""),
  reflection: text("reflection").notNull().default(""),
  competenciesJson: text("competencies_json").notNull().default("[]"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at").notNull(),
});

export const srsCards = sqliteTable(
  "srs_cards",
  {
    id: id(),
    userId: userId(),
    itemId: text("item_id")
      .notNull()
      .references(() => contentItems.id),
    /** Sub-key within an item, e.g. a question id inside a question bank item. */
    cardKey: text("card_key").notNull().default(""),
    kind: text("kind").notNull(),
    dueAt: integer("due_at").notNull(),
    intervalIdx: integer("interval_idx").notNull().default(0),
    lastResult: text("last_result"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("srs_cards_item").on(t.userId, t.itemId, t.cardKey),
    index("srs_cards_due").on(t.userId, t.dueAt),
  ],
);

export const tokenUsage = sqliteTable("token_usage", {
  id: id(),
  sessionId: text("session_id").references(() => sessions.id),
  role: text("role").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  createdAt: createdAt(),
});

export const contentMeta = sqliteTable("content_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
