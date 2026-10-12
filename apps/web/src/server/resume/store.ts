import "server-only";
import { desc, eq, max } from "drizzle-orm";
import { ulid } from "ulid";
import { parseResume, type ParsedResume } from "@swemock/shared";
import { DEFAULT_USER_ID, getDb } from "../db";
import { resumes } from "../db/schema";
import { ApiError } from "../http/errors";

export const MAX_RESUME_CHARS = 20_000;

export interface ResumeView {
  id: string;
  version: number;
  title: string;
  source: "paste" | "pdf";
  createdAt: number;
  chars: number;
  parsed: ParsedResume;
}

function toView(r: typeof resumes.$inferSelect): ResumeView {
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    source: r.source,
    createdAt: r.createdAt,
    chars: r.text.length,
    parsed: r.parsedJson ? (JSON.parse(r.parsedJson) as ParsedResume) : parseResume(r.text),
  };
}

export function listResumes(): ResumeView[] {
  return getDb().select().from(resumes).where(eq(resumes.userId, DEFAULT_USER_ID)).orderBy(desc(resumes.version)).all().map(toView);
}

/** A saved version is immutable: edit the text and save again to get the next version. */
export function saveResume(input: { title: string; text: string; source: "paste" | "pdf" }): ResumeView {
  const text = input.text.replace(/\r\n?/g, "\n").trim();
  if (text.length < 40) throw new ApiError(400, "That resume is too short to work with.");
  if (text.length > MAX_RESUME_CHARS) throw new ApiError(400, `Resumes are limited to ${MAX_RESUME_CHARS.toLocaleString()} characters.`);
  const db = getDb();
  const latest = db.select({ v: max(resumes.version) }).from(resumes).where(eq(resumes.userId, DEFAULT_USER_ID)).get()?.v ?? 0;
  const row = {
    id: ulid(),
    userId: DEFAULT_USER_ID,
    version: latest + 1,
    title: input.title.trim() || `Resume v${latest + 1}`,
    text,
    source: input.source,
    parsedJson: JSON.stringify(parseResume(text)),
  };
  db.insert(resumes).values(row).run();
  return toView(db.select().from(resumes).where(eq(resumes.id, row.id)).get()!);
}

export function getResumeText(id: string): { title: string; text: string } | null {
  const r = getDb().select().from(resumes).where(eq(resumes.id, id)).get();
  return r ? { title: r.title, text: r.text } : null;
}

export function deleteResume(id: string): void {
  getDb().delete(resumes).where(eq(resumes.id, id)).run();
}
