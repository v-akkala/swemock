import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadBehavioralItem, loadComprehensionItem, loadCsItem, loadDsaItem, loadExtensionItem, loadLldItem, loadReviewItem } from "@swemock/content";
import { validateTestInput } from "@swemock/shared";
import { describe, expect, it } from "vitest";
import { applyFix, validateComprehension, validateExtension, validateReview } from "./fluency";
import { validateQuestion } from "./questions";
import { scaffold, scaffoldDsa } from "./scaffold";

describe("scaffoldDsa", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-scaffold-"));

  it("creates a folder that loads with the real loader and has a valid example test", () => {
    const dir = scaffoldDsa(root, "my-new-problem", { difficulty: "medium" });
    const item = loadDsaItem(dir);
    expect(item.manifest.title).toBe("My New Problem");
    expect(item.manifest.difficulty).toBe("medium");
    expect(item.visible).toHaveLength(3);
    for (const t of item.visible) expect(validateTestInput(item.manifest.signature, t.input)).toBeNull();
    expect(fs.readFileSync(path.join(dir, "problem.yaml"), "utf8")).toContain("SCAFFOLD");
  });

  it("refuses bad slugs and existing folders", () => {
    expect(() => scaffoldDsa(root, "Bad_Slug", {})).toThrow(/not a valid slug/);
    expect(() => scaffoldDsa(root, "my-new-problem", {})).toThrow(/already exists/);
  });
});

describe("LLD scaffold", () => {
  it("loads with the real loader, has both languages, and keeps the SCAFFOLD marker", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-scaffold-lld-"));
    const dir = scaffold("lld", root, "my-system", { title: "My System", difficulty: "hard" });
    const item = loadLldItem(dir);
    expect(item.manifest).toMatchObject({ title: "My System", difficulty: "hard", format: "class" });
    expect(Object.keys(item.languages).sort()).toEqual(["cpp", "python"]);
    expect(Object.keys(item.languages.python!.tests.extension)).toEqual(["tests/extension/test_extension.py"]);
    expect(item.languages.python!.reference["tally.py"]).toContain("class Tally");
    expect(fs.readFileSync(path.join(dir, "problem.yaml"), "utf8")).toContain("SCAFFOLD");
  });
});

describe("question scaffolds", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-scaffold-q-"));

  it("load with the real loaders and are rejected until the SCAFFOLD marker is removed", () => {
    const cs = scaffold("cs", root, "hash-map-lookup", { difficulty: "medium" });
    expect(loadCsItem(cs).manifest).toMatchObject({ title: "Hash Map Lookup", difficulty: "medium" });
    const beh = scaffold("behavioral", root, "took-ownership", {});
    expect(loadBehavioralItem(beh).manifest.title).toBe("Took Ownership");
    for (const [type, dir] of [["cs", cs], ["behavioral", beh]] as const) {
      const before = validateQuestion(type, dir, new Map());
      expect(before.errors.join("\n")).toMatch(/SCAFFOLD/);
      const file = path.join(dir, "question.yaml");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^# SCAFFOLD.*\n/, ""));
      expect(validateQuestion(type, dir, new Map())).toEqual({ errors: [], warnings: [] });
    }
  });

  it("flags a duplicate prompt among the items it has seen", () => {
    const a = scaffold("cs", root, "dup-a", { title: "Dup question one" });
    const b = scaffold("cs", root, "dup-b", { title: "Dup question two" });
    for (const d of [a, b]) fs.writeFileSync(path.join(d, "question.yaml"), fs.readFileSync(path.join(d, "question.yaml"), "utf8").replace(/^# SCAFFOLD.*\n/, ""));
    const seen = new Map<string, string>();
    expect(validateQuestion("cs", a, seen).errors).toEqual([]);
    expect(validateQuestion("cs", b, seen).errors.join()).toMatch(/prompt duplicates cs\/dup-a/);
  });
});


describe("AI Fluency scaffolds", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-scaffold-fluency-"));
  // The static checks must stop before any container is needed.
  const judge = { runProject: () => Promise.reject(new Error("no docker in this test")) } as unknown as Parameters<typeof validateReview>[0];
  const unmark = (dir: string) => fs.writeFileSync(path.join(dir, "item.yaml"), fs.readFileSync(path.join(dir, "item.yaml"), "utf8").replace(/^# SCAFFOLD.*\n/, ""));

  it("comprehension loads, splits tests from bug tests, and is rejected until finished", async () => {
    const dir = scaffold("comprehension", root, "tiny-reader", { title: "Tiny Reader", difficulty: "easy" });
    const item = loadComprehensionItem(dir);
    expect(item.manifest).toMatchObject({ title: "Tiny Reader", difficulty: "easy", language: "python" });
    expect(Object.keys(item.code).length).toBeGreaterThan(0);
    expect(Object.keys(item.bugTests).every((p) => p.startsWith("tests/hidden/"))).toBe(true);
    expect((await validateComprehension(judge, dir)).errors.join()).toMatch(/SCAFFOLD/);
    unmark(dir);
    const report = await validateComprehension(judge, dir);
    expect(report.errors.join("\n")).not.toMatch(/SCAFFOLD/);
  });

  it("comprehension: every bug needs a test named after it", async () => {
    const dir = scaffold("comprehension", root, "needs-bug-test", {});
    unmark(dir);
    const file = path.join(dir, "item.yaml");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/- id: [\w-]+/, "- id: renamed-bug"));
    expect((await validateComprehension(judge, dir)).errors.join()).toMatch(/needs a test named test_bug_renamed_bug/);
  });

  it("review loads with base, head, tests and hidden tests, and is rejected until finished", async () => {
    const dir = scaffold("review", root, "tiny-pr", {});
    const item = loadReviewItem(dir);
    expect(item.manifest.decision).toBe("request_changes");
    expect(Object.keys(item.base)).toEqual(Object.keys(item.head).filter((p) => p in item.base));
    expect(Object.keys(item.hiddenTests).every((p) => p.startsWith("tests/hidden/"))).toBe(true);
    expect((await validateReview(judge, dir)).errors.join()).toMatch(/SCAFFOLD/);
  });

  it("extension loads with a ticket, conventions and a reference, and is rejected until finished", async () => {
    const dir = scaffold("extension", root, "tiny-repo", {});
    const item = loadExtensionItem(dir);
    expect(item.ticketMd).toContain("Ticket");
    expect(Object.keys(item.repo)).toContain("CONVENTIONS.md");
    expect(Object.keys(item.reference).length).toBeGreaterThan(0);
    expect((await validateExtension(judge, dir)).errors.join()).toMatch(/SCAFFOLD/);
  });

  it("refuses to load an extension without conventions or a reference", () => {
    const dir = scaffold("extension", root, "no-conventions", {});
    fs.rmSync(path.join(dir, "repo", "CONVENTIONS.md"));
    expect(() => loadExtensionItem(dir)).toThrow(/CONVENTIONS.md/);
    const dir2 = scaffold("extension", root, "no-reference", {});
    fs.rmSync(path.join(dir2, "reference"), { recursive: true });
    expect(() => loadExtensionItem(dir2)).toThrow(/reference/);
  });
});

describe("applyFix", () => {
  const files = { "a.py": "x = 1\ny = 2\ny = 2\n" };

  it("replaces one exact snippet", () => {
    expect(applyFix(files, { file: "a.py", old: "x = 1", new: "x = 10" })["a.py"]).toBe("x = 10\ny = 2\ny = 2\n");
  });

  it("refuses a missing file, a missing snippet, and an ambiguous one", () => {
    expect(() => applyFix(files, { file: "b.py", old: "x", new: "y" })).toThrow(/doesn't exist/);
    expect(() => applyFix(files, { file: "a.py", old: "z = 3", new: "" })).toThrow(/isn't in the file/);
    expect(() => applyFix(files, { file: "a.py", old: "y = 2", new: "" })).toThrow(/more than once/);
  });
});
