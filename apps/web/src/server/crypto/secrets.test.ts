import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { freshTempDatabase } from "../test-utils";

describe("secrets", () => {
  let dir: string;
  beforeEach(() => {
    dir = freshTempDatabase();
  });

  it("encrypts at rest, round-trips, masks, and deletes", async () => {
    const s = await import("./secrets");
    const { getDb } = await import("../db");
    s.setSecret("anthropic.apiKey", "sk-ant-secret-1234");
    const stat = fs.statSync(path.join(dir, "master.key"));
    expect(stat.mode & 0o777).toBe(0o600);
    const raw = JSON.stringify(getDb().select().from((await import("../db/schema")).secrets).all());
    expect(raw).not.toContain("sk-ant-secret");
    expect(s.getSecret("anthropic.apiKey")).toBe("sk-ant-secret-1234");
    expect(s.maskSecret(s.getSecret("anthropic.apiKey"))).toBe("••••••••1234");
    s.deleteSecret("anthropic.apiKey");
    expect(s.getSecret("anthropic.apiKey")).toBeNull();
  });

  it("returns null instead of garbage when the master key changed", async () => {
    const s = await import("./secrets");
    s.setSecret("k", "value-123456");
    fs.writeFileSync(path.join(dir, "master.key"), "00".repeat(32));
    expect(s.getSecret("k")).toBeNull();
  });
});
