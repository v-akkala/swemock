import "server-only";
import { eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ModelRole, Provider } from "@swemock/shared";
import { getDb } from "../db";
import { tokenUsage } from "../db/schema";
import { readSettings } from "../settings";
import { AiError, type Usage } from "./types";

export function recordUsage(opts: { sessionId: string | null; role: ModelRole; provider: Provider; model: string; usage: Usage }): void {
  getDb()
    .insert(tokenUsage)
    .values({
      id: ulid(),
      sessionId: opts.sessionId,
      role: opts.role,
      provider: opts.provider,
      model: opts.model,
      inputTokens: opts.usage.inputTokens,
      outputTokens: opts.usage.outputTokens,
      cacheReadTokens: opts.usage.cacheReadTokens,
      cacheWriteTokens: opts.usage.cacheWriteTokens,
    })
    .run();
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  total: number;
  cap: number;
}

export function sessionUsage(sessionId: string): SessionUsage {
  const row = getDb()
    .select({
      input: sql<number>`coalesce(sum(${tokenUsage.inputTokens}), 0)`,
      output: sql<number>`coalesce(sum(${tokenUsage.outputTokens}), 0)`,
      cacheRead: sql<number>`coalesce(sum(${tokenUsage.cacheReadTokens}), 0)`,
    })
    .from(tokenUsage)
    .where(eq(tokenUsage.sessionId, sessionId))
    .get()!;
  const cap = readSettings(getDb()).sessionTokenCap;
  return { inputTokens: row.input, outputTokens: row.output, cacheReadTokens: row.cacheRead, total: row.input + row.output, cap };
}

/** Refuses a hosted-model call once the session has used its token budget (Settings → token cap). */
export function assertUnderCap(sessionId: string | null, provider: Provider): void {
  if (!sessionId || provider === "ollama" || provider === "fake") return; // local models cost nothing
  const u = sessionUsage(sessionId);
  if (u.cap > 0 && u.total >= u.cap) {
    throw new AiError("cap", `This session reached its token cap (${u.cap.toLocaleString()} tokens). Raise it in Settings, or continue with copy-prompt.`);
  }
}
