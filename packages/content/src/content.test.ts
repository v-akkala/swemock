import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ContentError, fingerprintTree, hashItemDir, loadBehavioralItem, loadContentDir, loadCsItem, loadDsaItem, toStored } from "./index";

const REPO_CONTENT = path.resolve(import.meta.dirname, "../../../content");

describe("real content", () => {
  const { items, errors } = loadContentDir(REPO_CONTENT);

  it("loads every shipped item without errors", () => {
    expect(errors.map((e) => e.message)).toEqual([]);
    expect(items.length).toBeGreaterThan(0);
  });

  it("keeps everything private out of the public form", () => {
    for (const item of items) {
      if (item.type === "cs") {
        const pub = toStored(item).publicJson;
        for (const k of item.manifest.key_points) expect(pub, item.slug).not.toContain(JSON.stringify(k).slice(1, -1));
        expect(pub, item.slug).not.toContain(JSON.stringify(item.manifest.model_answer).slice(1, -1));
        expect(pub, item.slug).not.toContain('"correct"');
        continue;
      }
      if (item.type === "behavioral") {
        const pub = toStored(item).publicJson;
        for (const f of item.manifest.follow_ups) expect(pub, item.slug).not.toContain(JSON.stringify(f).slice(1, -1));
        for (const f of item.manifest.strong_signals) expect(pub, item.slug).not.toContain(JSON.stringify(f).slice(1, -1));
        continue;
      }
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
      if (item.type !== "dsa") continue;
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

describe("question content", () => {
  function tmpQuestion(yaml: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swemock-q-"));
    const item = path.join(dir, "demo-question");
    fs.mkdirSync(item);
    fs.writeFileSync(path.join(item, "question.yaml"), yaml);
    return item;
  }
  const cs = `title: Stack versus heap
difficulty: easy
topics: [memory]
version: 1
prompt: Where do local variables live, and where does \`new\` allocate?
key_points:
  - Locals live on the stack and are freed when the function returns
  - Dynamic allocations live on the heap and need explicit or managed lifetime
model_answer: Locals go on the stack; dynamically allocated objects go on the heap.
`;

  it("loads a CS question and keeps the answer private", () => {
    const item = loadCsItem(tmpQuestion(cs));
    const stored = toStored(item);
    expect(stored).toMatchObject({ type: "cs", slug: "demo-question", difficulty: "easy", tags: ["memory"] });
    expect(JSON.parse(stored.privateJson)).toMatchObject({ keyPoints: expect.any(Array), correctOption: null });
    expect(stored.publicJson).not.toContain("freed when");
  });

  it("accepts unquoted list items that contain a colon", () => {
    const item = loadCsItem(tmpQuestion(cs.replace("  - Locals live on the stack and are freed when the function returns", "  - Stack: locals are freed when the function returns")));
    expect(item.manifest.key_points[0]).toBe("Stack: locals are freed when the function returns");
  });

  it("requires key points, and exactly one correct option for an MCQ", () => {
    expect(() => loadCsItem(tmpQuestion(cs.replace(/key_points:[\s\S]*model_answer/, "key_points:\n  - only one\nmodel_answer")))).toThrow(/key_points/);
    const mcq = (opts: string) => cs.replace("difficulty: easy", "difficulty: easy\nformat: mcq") + opts;
    const options = (flags: boolean[]) => "options:\n" + flags.map((f, i) => `  - text: Option ${i}\n    correct: ${f}`).join("\n") + "\n";
    expect(() => loadCsItem(tmpQuestion(mcq(options([false, false, false]))))).toThrow(/exactly one correct option \(found 0\)/);
    expect(() => loadCsItem(tmpQuestion(mcq(options([true, true, false]))))).toThrow(/found 2/);
    const ok = toStored(loadCsItem(tmpQuestion(mcq(options([false, true, false])))));
    expect(JSON.parse(ok.privateJson).correctOption).toBe(1);
    expect(JSON.parse(ok.publicJson).options).toEqual(["Option 0", "Option 1", "Option 2"]);
    expect(() => loadCsItem(tmpQuestion(cs + options([true, false, false])))).toThrow(/only MCQs have options/);
  });

  it("loads a behavioral question and needs 3–5 follow-ups", () => {
    const base = `title: Disagreeing with a manager
competencies: [conflict]
version: 1
prompt: Tell me about a time you disagreed with your manager.
strong_signals:
  - Describes the disagreement and the stakes
  - Shows respect while holding a position
`;
    const followUps = (n: number) => "follow_ups:\n" + Array.from({ length: n }, (_, i) => `  - Follow-up ${i}?`).join("\n") + "\n";
    expect(() => loadBehavioralItem(tmpQuestion(base + followUps(2)))).toThrow(/follow_ups/);
    const item = loadBehavioralItem(tmpQuestion(base + followUps(3)));
    const stored = toStored(item);
    expect(stored).toMatchObject({ type: "behavioral", difficulty: null, tags: ["conflict"] });
    expect(JSON.parse(stored.privateJson).followUps).toHaveLength(3);
    expect(stored.publicJson).not.toContain("Follow-up");
    expect(() => loadBehavioralItem(tmpQuestion(base.replace("[conflict]", "[confict]") + followUps(3)))).toThrow(/competencies/);
  });
});
