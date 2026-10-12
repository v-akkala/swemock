import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOrCreateSecret, secretMatches } from "../../src/secret";

describe("secret", () => {
  it("generates once and then reuses the secret", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "swemock-secret-")), "nested", "secret");
    const a = loadOrCreateSecret(file);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(loadOrCreateSecret(file)).toBe(a);
  });

  it("only accepts the exact bearer token", () => {
    expect(secretMatches("Bearer abc", "abc")).toBe(true);
    expect(secretMatches("Bearer abd", "abc")).toBe(false);
    expect(secretMatches("abc", "abc")).toBe(false);
    expect(secretMatches(undefined, "abc")).toBe(false);
    expect(secretMatches("Bearer ab", "abc")).toBe(false);
  });
});
