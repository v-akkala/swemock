import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDsaItem } from "@swemock/content";
import { validateTestInput } from "@swemock/shared";
import { describe, expect, it } from "vitest";
import { scaffoldDsa } from "./scaffold";

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
