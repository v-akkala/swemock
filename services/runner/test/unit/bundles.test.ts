import { dsaRunRequestSchema, projectRunRequestSchema } from "@swemock/shared";
import { describe, expect, it } from "vitest";
import { buildDsaBundle, buildProjectBundle, MAX_TEST_BUDGET_MS } from "../../src/bundles";
import { shellQuote } from "../../src/languages";
import { containerSpec } from "../../src/sandbox";

const sig = {
  kind: "function" as const,
  name: "add",
  params: [
    { name: "a", type: "int" },
    { name: "b", type: "int" },
  ],
  returns: "int",
};

describe("buildDsaBundle", () => {
  it("compiles C++ with a generated driver and runs Python through the generic driver", () => {
    const tests = [{ id: "1", input: { a: 1, b: 2 }, expected: 3 }];
    const cpp = buildDsaBundle(dsaRunRequestSchema.parse({ language: "cpp", code: "x", signature: sig, tests }));
    expect(Object.keys(cpp.payload.files as object)).toEqual(["solution.cpp", "main.cpp"]);
    expect(cpp.payload.compile).toMatchObject({ argv: expect.arrayContaining(["g++", "-std=c++20", "-O2"]) });

    const py = buildDsaBundle(dsaRunRequestSchema.parse({ language: "python", code: "x", signature: sig, tests }));
    expect(py.payload.compile).toBeNull();
    expect((py.payload.run as { argv: string[] }).argv).toContain("/sandbox/python/driver.py");
  });

  it("caps the test budget and sets a hard deadline beyond it", () => {
    const tests = Array.from({ length: 200 }, (_, i) => ({ id: String(i), input: { a: 1, b: 1 } }));
    const b = buildDsaBundle(dsaRunRequestSchema.parse({ language: "python", code: "x", signature: sig, tests }));
    expect(b.payload.budgetMs).toBe(MAX_TEST_BUDGET_MS);
    expect(b.deadlineMs).toBeGreaterThan(MAX_TEST_BUDGET_MS);
  });
});

describe("buildProjectBundle", () => {
  it("shell-quotes the run-current-file path", () => {
    const b = buildProjectBundle(
      projectRunRequestSchema.parse({
        language: "python",
        files: { "a b'.py": "print(1)" },
        command: { kind: "runFile", path: "a b'.py" },
      }),
    );
    expect(b.payload.command).toBe(`PYTHONUNBUFFERED=1 python3 'a b'\\''.py'`);
  });

  it("rejects paths that escape the workspace", () => {
    for (const p of ["../x.py", "/etc/passwd", "a/../../b"]) {
      expect(
        projectRunRequestSchema.safeParse({ language: "python", files: { [p]: "" }, command: { kind: "shell", cmd: "true" } })
          .success,
      ).toBe(false);
    }
  });
});

describe("shellQuote", () => {
  it("quotes single quotes", () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe("containerSpec", () => {
  it("applies the sandbox limits from spec §5.1", () => {
    const s = containerSpec("img", 256);
    expect(s.NetworkDisabled).toBe(true);
    expect(s.User).toBe("65534:65534");
    expect(s.HostConfig).toMatchObject({
      NetworkMode: "none",
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      NanoCpus: 1_000_000_000,
      PidsLimit: 64,
      Privileged: false,
      Binds: [],
    });
    expect(s.HostConfig.Memory).toBe(s.HostConfig.MemorySwap);
  });
});
