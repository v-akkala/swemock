import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ContentError, fingerprintTree, hashItemDir, loadContentDir, loadDsaItem, toStored } from "./index";

const REPO_CONTENT = path.resolve(import.meta.dirname, "../../../content");

describe("real content", () => {
  const { items, errors } = loadContentDir(REPO_CONTENT);

  it("loads every shipped item without errors", () => {
    expect(errors.map((e) => e.message)).toEqual([]);
    expect(items.length).toBeGreaterThan(0);
  });

  it("keeps everything private out of the public form", () => {
    for (const item of items) {
      const stored = toStored(item);
      const pub = stored.publicJson;
      expect(pub, item.slug).not.toContain("hiddenTests");
      expect(pub, item.slug).not.toContain("editorialMd");
      expect(pub, item.slug).not.toContain("references");
      for (const hint of item.manifest.hints) expect(pub, item.slug).not.toContain(JSON.stringify(hint).slice(1, -1));
      for (const f of item.manifest.followups) expect(pub, item.slug).not.toContain(JSON.stringify(f).slice(1, -1));
      const hiddenInput = item.hidden[0] && JSON.stringify(item.hidden[0].input);
      if (hiddenInput && hiddenInput.length > 40) expect(pub, item.slug).not.toContain(hiddenInput);
      for (const src of Object.values(item.references)) expect(pub, item.slug).not.toContain(JSON.stringify(src).slice(1, 60));
    }
  });

  it("uses distinct ids for visible and hidden tests", () => {
    for (const item of items) {
      const ids = [...item.visible, ...item.hidden].map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("loader errors and hashing", () => {
  function tmpItem(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-content-"));
    const item = path.join(dir, "demo-item");
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(item, rel)), { recursive: true });
      fs.writeFileSync(path.join(item, rel), text);
    }
    return item;
  }

  it("reports a missing manifest and bad YAML by slug", () => {
    expect(() => loadDsaItem(tmpItem({ "x.txt": "" }))).toThrow(/demo-item: problem.yaml is missing/);
    expect(() => loadDsaItem(tmpItem({ "problem.yaml": "title: [" }))).toThrow(ContentError);
  });

  it("rejects unknown keys and unknown tags", () => {
    const base = fs.readFileSync(path.join(REPO_CONTENT, "dsa/balanced-brackets/problem.yaml"), "utf8");
    const files = (yaml: string) => ({
      "problem.yaml": yaml,
      "statement.md": "s",
      "editorial.md": "e",
      "tests/visible.json": "[]",
    });
    expect(() => loadDsaItem(tmpItem(files(base + "surprise: 1\n")))).toThrow(/surprise/);
    expect(() => loadDsaItem(tmpItem(files(base.replace("[stack, strings]", "[stakc]"))))).toThrow(/tags/);
  });

  it("hash changes with content, fingerprint with mtime or size", () => {
    const dir = tmpItem({ "a.txt": "one" });
    const h1 = hashItemDir(dir);
    const f1 = fingerprintTree(path.dirname(dir));
    fs.writeFileSync(path.join(dir, "a.txt"), "three");
    expect(hashItemDir(dir)).not.toBe(h1);
    expect(fingerprintTree(path.dirname(dir))).not.toBe(f1);
    fs.writeFileSync(path.join(dir, "a.txt"), "one");
    expect(hashItemDir(dir)).toBe(h1);
  });
});
