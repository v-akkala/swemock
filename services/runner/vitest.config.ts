import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      // Needs Docker and the sandbox images (see CLAUDE.md). Runs containers one test file at a time.
      {
        test: {
          name: "sandbox",
          include: ["test/sandbox/**/*.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
