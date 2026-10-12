import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTemplate, render } from "./templates";

const PROMPTS = path.resolve(import.meta.dirname, "../../../../../prompts");

describe("templates", () => {
  it("parses front matter and renders placeholders", () => {
    const { meta, body } = parseTemplate("---\nid: x\nversion: 2\n---\nHello {{name}}!");
    expect(meta).toEqual({ id: "x", version: "2" });
    expect(render(body, { name: "Ada" })).toBe("Hello Ada!");
    expect(() => render(body, {})).toThrow(/name/);
  });

  it("every shipped template has an id and a version", () => {
    const files = fs.readdirSync(PROMPTS, { recursive: true }).map(String).filter((f) => f.endsWith(".md") && !f.startsWith("authoring"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const { meta } = parseTemplate(fs.readFileSync(path.join(PROMPTS, f), "utf8"));
      expect(meta.id, f).toBeTruthy();
      expect(meta.version, f).toMatch(/^\d+$/);
    }
  });
});
