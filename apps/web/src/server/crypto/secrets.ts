import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { dataDir } from "../config";
import { getDb } from "../db";
import { secrets } from "../db/schema";

/**
 * API keys are encrypted at rest (AES-256-GCM) with a master key generated locally on first use and kept
 * in the data volume (mode 0600). Keys are never logged and never sent back to the browser; the UI only
 * gets a masked hint.
 */
const MASTER_KEY_FILE = "master.key";

function masterKey(): Buffer {
  const file = path.join(dataDir(), MASTER_KEY_FILE);
  try {
    const hex = fs.readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  } catch {
    /* create below */
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString("hex") + "\n", { mode: 0o600 });
  return key;
}

export function setSecret(name: string, value: string, now = Date.now()): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const row = {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    updatedAt: now,
  };
  getDb()
    .insert(secrets)
    .values({ name, ...row })
    .onConflictDoUpdate({ target: secrets.name, set: row })
    .run();
}

export function getSecret(name: string): string | null {
  const row = getDb().select().from(secrets).where(eq(secrets.name, name)).get();
  if (!row) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(row.iv, "base64"));
    decipher.setAuthTag(Buffer.from(row.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // The master key changed (data volume restored without it): the stored key is unusable.
    return null;
  }
}

export function deleteSecret(name: string): void {
  getDb().delete(secrets).where(eq(secrets.name, name)).run();
}

/** "••••••••abcd": enough to recognize which key is stored, useless to anyone reading the screen. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  return `••••••••${value.slice(-4)}`;
}
