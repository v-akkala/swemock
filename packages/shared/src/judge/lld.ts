import type { Language } from "./protocol";

/**
 * How an LLD workspace is built and tested (spec §5.3). The commands are fixed per language rather than
 * written in each manifest, so every problem behaves the same and a manifest can't run arbitrary commands.
 * Python: pytest over `tests/`. C++: doctest, header-only solutions, one main in `doctest_main.cpp`.
 */
export const LLD_TEST_COMMAND: Record<Language, string> = {
  python: "mkdir -p .results && python3 -m pytest -q -p no:cacheprovider --junitxml=.results/junit.xml tests",
  cpp: "mkdir -p .results && g++ -std=c++20 -O1 -I. -I/sandbox/cpp -o suite doctest_main.cpp $(find tests -name '*.cpp' | sort) && ./suite -r=junit -o=.results/junit.xml",
};

export const LLD_RESULTS_PATH = ".results/junit.xml";

/** First match wins; anything else is "core". Test names carry the category (`test_edge_…`, `"edge: …"`). */
export const LLD_CATEGORIES: { pattern: string; category: "core" | "edge" | "extension" }[] = [
  { pattern: "extension", category: "extension" },
  { pattern: "[Ee]dge", category: "edge" },
];

/** Tests under tests/hidden and tests/extension are hidden from the candidate (only counts are shown). */
export const isHiddenLldTest = (classname: string, file?: string): boolean => /(^|[./\\])(hidden|extension)([./\\_]|$)/.test(`${classname} ${file ?? ""}`);

export const LLD_SUPPORT_NOTE = "conftest.py (Python) and doctest_main.cpp (C++) live in support/ and are copied into every workspace.";

export type LldCategory = "core" | "edge" | "extension";

const NAME_RE: Record<Language, RegExp> = {
  python: /^\s*def (test_\w+)/gm,
  cpp: /TEST_CASE\("([^"]*)"/g,
};

/** The category a test name declares (`test_edge_…`, `"edge: …"`), or null if it doesn't follow the convention. */
export function lldCategoryOf(name: string): LldCategory | null {
  if (/^test_extension_|^extension:/.test(name)) return "extension";
  if (/^test_edge_|^edge:/.test(name)) return "edge";
  if (/^test_core_|^core:/.test(name)) return "core";
  return null;
}

/** Tests declared in a set of test files, found by a cheap scan (the real run is the authority). */
export function declaredLldTests(lang: Language, files: Record<string, string>): { name: string; category: LldCategory | null }[] {
  return Object.values(files).flatMap((text) => [...text.matchAll(NAME_RE[lang])].map((m) => ({ name: m[1]!, category: lldCategoryOf(m[1]!) })));
}
