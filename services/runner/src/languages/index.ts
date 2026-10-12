import type { Language } from "@swemock/shared";
import { cpp } from "./cpp";
import { python } from "./python";
import type { LanguageProfile } from "./types";

export type { LanguageProfile } from "./types";
export { shellQuote } from "./types";

export const PROFILES: Record<Language, LanguageProfile> = { python, cpp };
