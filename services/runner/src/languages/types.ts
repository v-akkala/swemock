import type { Language, Signature } from "@swemock/shared";

export interface Command {
  argv: string[];
  env?: Record<string, string>;
}

/**
 * Everything the runner knows about one language. To add a language: build a sandbox image
 * (images/sandbox-<name>), add a profile here and in ./index.ts, and a codegen module in
 * packages/shared/src/judge/codegen.
 */
export interface LanguageProfile {
  id: Language;
  /** Image name suffix: `${prefix}${image}:${tag}`. */
  image: string;
  /** Resident memory of the bare runtime (KB), not counted against the user's limit. */
  memoryAllowanceKb: number;
  /** Files, compile step, and driver command for a DSA run. */
  dsa(code: string, sig: Signature, memoryLimitMb: number): {
    files: Record<string, string>;
    compile: (Command & { timeoutMs: number }) | null;
    run: Command;
  };
  /** Shell command that runs one workspace file ("run current file"). `path` is shell-quoted. */
  runFile(quotedPath: string): string;
}

/** POSIX single-quote a string for `sh -c`. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
