import type { Language } from "../protocol";
import { cpp } from "./cpp";
import { python } from "./python";
import type { LanguageCodegen } from "./types";

export type { LanguageCodegen } from "./types";
export { cppType } from "./cpp";
export { pythonType } from "./python";

/** Per-language codegen. Adding a language: implement LanguageCodegen and register it here. */
export const CODEGEN: Record<Language, LanguageCodegen> = { python, cpp };

export function generateStub(sig: Parameters<LanguageCodegen["stub"]>[0], language: Language): string {
  return CODEGEN[language].stub(sig);
}
