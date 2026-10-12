import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, settingsPatchSchema } from "./settings";

describe("normalizeSettings", () => {
  it("returns defaults for garbage input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid keys and replaces invalid ones with defaults", () => {
    const s = normalizeSettings({ provider: "anthropic", theme: "purple", extra: 1 });
    expect(s.provider).toBe("anthropic");
    expect(s.theme).toBe("dark");
    expect(s).not.toHaveProperty("extra");
  });
});

describe("settingsPatchSchema", () => {
  it("rejects unknown keys and bad providers", () => {
    expect(settingsPatchSchema.safeParse({ nope: true }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ provider: "gpt" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ provider: "ollama" }).success).toBe(true);
  });
});
