import type { Signature } from "../signature";

/** What each language contributes to DSA judging. Register new languages in ./index.ts. */
export interface LanguageCodegen {
  /** Starter code shown in the editor. */
  stub(sig: Signature): string;
  /** Extra generated files compiled alongside the user's code (e.g. a C++ `main.cpp`). */
  driverFiles(sig: Signature): Record<string, string>;
}
