import { z } from "zod";

export const PROVIDERS = ["none", "ollama", "openai-compatible", "anthropic"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;

export const MODEL_ROLES = ["interviewer", "assistant", "grader", "fast"] as const;
export const modelRoleSchema = z.enum(MODEL_ROLES);
export type ModelRole = z.infer<typeof modelRoleSchema>;

export const themeSchema = z.enum(["dark", "light"]);
export type Theme = z.infer<typeof themeSchema>;

/** Model ID per role, per provider. Empty string means "use the provider default". */
export const roleModelsSchema = z.object({
  interviewer: z.string().max(200),
  assistant: z.string().max(200),
  grader: z.string().max(200),
  fast: z.string().max(200),
});
export type RoleModels = z.infer<typeof roleModelsSchema>;

const emptyRoles: RoleModels = { interviewer: "", assistant: "", grader: "", fast: "" };

export const featureFlagsSchema = z.object({
  voiceInput: z.boolean(),
  fallibleMode: z.boolean(),
});

export const settingsSchema = z.object({
  provider: providerSchema,
  theme: themeSchema,
  /** Per-provider role → model overrides. */
  models: z.object({
    ollama: roleModelsSchema,
    "openai-compatible": roleModelsSchema,
    anthropic: roleModelsSchema,
  }),
  ollamaBaseUrl: z.string().url().max(500),
  openaiCompatibleBaseUrl: z.string().max(500),
  /** Per-session token cap for hosted providers; 0 disables the cap. */
  sessionTokenCap: z.number().int().min(0).max(10_000_000),
  features: featureFlagsSchema,
  onboardingDone: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  provider: "none",
  theme: "dark",
  models: {
    ollama: { ...emptyRoles },
    "openai-compatible": { ...emptyRoles },
    anthropic: { ...emptyRoles },
  },
  ollamaBaseUrl: "http://host.docker.internal:11434",
  openaiCompatibleBaseUrl: "",
  sessionTokenCap: 200_000,
  features: { voiceInput: false, fallibleMode: false },
  onboardingDone: false,
};

/** Partial update accepted by the settings API. Nested objects are replaced wholesale. */
export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Stored settings may be from an older version: fill missing keys from defaults, drop unknown ones. */
export function normalizeSettings(raw: unknown): Settings {
  const base = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const candidate = settingsSchema.shape[key].safeParse(base[key]);
    if (candidate.success) merged[key] = candidate.data;
  }
  return settingsSchema.parse(merged);
}
