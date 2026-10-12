import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Reads the shared web↔runner secret, generating it on first start. */
export function loadOrCreateSecret(file: string): string {
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* create below */
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const secret = crypto.randomBytes(32).toString("hex");
  // The volume holding this file is mounted only into `runner` (rw) and `web` (ro).
  fs.writeFileSync(file, secret + "\n", { mode: 0o644 });
  return secret;
}

export function secretMatches(header: string | undefined, secret: string): boolean {
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
