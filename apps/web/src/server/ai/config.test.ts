import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshTempDatabase } from "../test-utils";

async function load() {
  const config = await import("./config");
  const { updateSettings } = await import("../settings");
  const { getDb } = await import("../db");
  const { setSecret } = await import("../crypto/secrets");
  return { ...config, update: (p: Parameters<typeof updateSettings>[1]) => updateSettings(getDb(), p), setSecret };
}

beforeEach(() => {
  freshTempDatabase();
});
afterEach(() => vi.unstubAllEnvs());

describe("resolveAi", () => {
  it("is not connected with provider none, and names what's missing for others", async () => {
    const c = await load();
    expect(c.resolveAi()).toMatchObject({ provider: "none", connected: false });
    c.update({ provider: "anthropic" });
    expect(c.resolveAi()).toMatchObject({ connected: false, problem: expect.stringContaining("API key") });
    c.setSecret(c.KEY_NAMES.anthropic, "sk-ant-xyz-123456");
    expect(c.resolveAi()).toMatchObject({ connected: true, models: { interviewer: "claude-opus-5-5", fast: "claude-haiku-5-5" } });
    c.update({ provider: "openai-compatible" });
    expect(c.resolveAi().problem).toContain("base URL");
  });

  it("applies per-role settings and environment overrides", async () => {
    const c = await load();
    c.update({ provider: "ollama", models: { ollama: { interviewer: "llama3.3:70b", assistant: "", grader: "", fast: "" }, anthropic: { interviewer: "", assistant: "", grader: "", fast: "" }, "openai-compatible": { interviewer: "", assistant: "", grader: "", fast: "" } } });
    expect(c.resolveAi().models).toMatchObject({ interviewer: "llama3.3:70b", grader: "qwen3.5:9b" });
    vi.stubEnv("SWEMOCK_MODEL_GRADER", "gemma4:12b");
    expect(c.resolveAi()).toMatchObject({ models: { grader: "gemma4:12b" }, envOverrides: ["SWEMOCK_MODEL_GRADER"] });
    expect(c.resolveAi().baseUrl).toBe("http://host.docker.internal:11434/v1");
  });

  it("only allows the fake provider when the test switch is on", async () => {
    const c = await load();
    vi.stubEnv("SWEMOCK_PROVIDER", "fake");
    expect(c.resolveAi().provider).toBe("none");
    vi.stubEnv("SWEMOCK_TEST_MODE", "1");
    expect(c.resolveAi()).toMatchObject({ provider: "fake", connected: true });
  });
});
