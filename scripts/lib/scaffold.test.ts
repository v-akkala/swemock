import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadBehavioralItem, loadCsItem, loadDsaItem } from "@swemock/content";
import { validateTestInput } from "@swemock/shared";
import { describe, expect, it } from "vitest";
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
