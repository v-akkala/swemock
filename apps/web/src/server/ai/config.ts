import "server-only";
import { DEFAULT_MODELS, MODEL_ROLES, providerSchema, type ModelRole, type Provider, type RoleModels } from "@swemock/shared";
import { getSecret, maskSecret } from "../crypto/secrets";
import { getDb } from "../db";
import { readSettings } from "../settings";
import { anthropicProvider } from "./providers/anthropic";
import { fakeProvider } from "./providers/fake";
import { openAiCompatibleProvider } from "./providers/openai-compatible";
import { AiError, type LLMProvider } from "./types";

export const KEY_NAMES = { anthropic: "anthropic.apiKey", "openai-compatible": "openai-compatible.apiKey" } as const;

/** Test mode (SWEMOCK_TEST_MODE=1) allows the fake provider and the data-reset endpoint used by e2e tests. */
export function testMode(): boolean {
  return process.env.SWEMOCK_TEST_MODE === "1";
}

export const fakeProviderEnabled = testMode;

const ENV_MODEL: Record<ModelRole, string> = {
  interviewer: "SWEMOCK_MODEL_INTERVIEWER",
  assistant: "SWEMOCK_MODEL_ASSISTANT",
  grader: "SWEMOCK_MODEL_GRADER",
  fast: "SWEMOCK_MODEL_FAST",
};

export interface ResolvedAi {
  provider: Provider;
  /** Model per role after defaults and env overrides. */
  models: RoleModels;
  baseUrl: string | null;
  /** Ready to make calls: a model provider with everything it needs. */
  connected: boolean;
  /** Why not connected, for the UI. */
  problem: string | null;
  /** Settings the environment overrides (shown as read-only in the UI). */
  envOverrides: string[];
}

/** Settings + environment overrides (SWEMOCK_PROVIDER, SWEMOCK_MODEL_*) → the effective configuration. */
export function resolveAi(): ResolvedAi {
  const settings = readSettings(getDb());
  const envOverrides: string[] = [];
  let provider: Provider = settings.provider;
  const envProvider = providerSchema.safeParse(process.env.SWEMOCK_PROVIDER);
  if (process.env.SWEMOCK_PROVIDER && envProvider.success) {
    provider = envProvider.data;
    envOverrides.push("SWEMOCK_PROVIDER");
  }
  if (provider === "fake" && !fakeProviderEnabled()) provider = "none";

  const models: RoleModels = { interviewer: "", assistant: "", grader: "", fast: "" };
  if (provider !== "none" && provider !== "fake") {
    for (const role of MODEL_ROLES) {
      models[role] = settings.models[provider][role] || DEFAULT_MODELS[provider][role];
    }
  }
  for (const role of MODEL_ROLES) {
    const v = process.env[ENV_MODEL[role]];
    if (v) {
      models[role] = v;
      envOverrides.push(ENV_MODEL[role]);
    }
  }

  let baseUrl: string | null = null;
  let problem: string | null = null;
  if (provider === "none") problem = "No AI provider is configured.";
  if (provider === "ollama") baseUrl = `${settings.ollamaBaseUrl.replace(/\/+$/, "")}/v1`;
  if (provider === "openai-compatible") {
    baseUrl = settings.openaiCompatibleBaseUrl.trim() || null;
    if (!baseUrl) problem = "Set the endpoint's base URL in Settings.";
  }
  if (provider === "anthropic" && !getSecret(KEY_NAMES.anthropic)) problem = "Add your Anthropic API key in Settings.";
  if (!problem && provider !== "fake" && provider !== "none" && MODEL_ROLES.some((r) => !models[r])) {
    problem = "Name a model for every role in Settings.";
  }
  return { provider, models, baseUrl, connected: provider !== "none" && problem === null, problem, envOverrides };
}

/** The provider for the current configuration. Throws AiError("config") when none is usable. */
export function getProvider(resolved = resolveAi()): LLMProvider {
  if (!resolved.connected) throw new AiError("config", resolved.problem ?? "No AI provider is configured.");
  switch (resolved.provider) {
    case "anthropic":
      return anthropicProvider(getSecret(KEY_NAMES.anthropic)!);
    case "ollama":
      return openAiCompatibleProvider({ id: "ollama", baseUrl: resolved.baseUrl!, apiKey: null });
    case "openai-compatible":
      return openAiCompatibleProvider({ id: "openai-compatible", baseUrl: resolved.baseUrl!, apiKey: getSecret(KEY_NAMES["openai-compatible"]) });
    case "fake":
      return fakeProvider();
    default:
      throw new AiError("config", "No AI provider is configured.");
  }
}

/** Masked key hints for the settings page. Keys themselves never leave the server. */
export function keyHints(): Record<keyof typeof KEY_NAMES, string | null> {
  return {
    anthropic: maskSecret(getSecret(KEY_NAMES.anthropic)),
    "openai-compatible": maskSecret(getSecret(KEY_NAMES["openai-compatible"])),
  };
}
