import type { LanguageProfile } from "./types";

export const python: LanguageProfile = {
  id: "python",
  image: "sandbox-python",
  memoryAllowanceKb: 0,
  dsa(code, sig) {
    return {
      files: { "solution.py": code, "signature.json": JSON.stringify(sig) },
      compile: null,
      run: {
        argv: ["python3", "/sandbox/python/driver.py", "solution.py", "signature.json"],
        // Unbuffered so output printed before a timeout or crash isn't lost.
        env: { PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1" },
      },
    };
  },
  runFile: (path) => `PYTHONUNBUFFERED=1 python3 ${path}`,
};
