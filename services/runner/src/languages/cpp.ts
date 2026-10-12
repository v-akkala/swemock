import { CODEGEN } from "@swemock/shared";
import type { LanguageProfile } from "./types";

/** Must match the flags the image used to precompile swemock.hpp (images/sandbox-cpp/Dockerfile). */
export const CXXFLAGS = ["-std=c++20", "-O2", "-pipe", "-I/sandbox/cpp"];

export const cpp: LanguageProfile = {
  id: "cpp",
  image: "sandbox-cpp",
  memoryAllowanceKb: 0,
  dsa(code, sig) {
    return {
      files: { "solution.cpp": code, ...CODEGEN.cpp.driverFiles(sig) },
      compile: { argv: ["g++", ...CXXFLAGS, "-o", "main", "main.cpp"], timeoutMs: 30_000 },
      run: { argv: ["./main"] },
    };
  },
  runFile: (path) => `mkdir -p .swemock && g++ ${CXXFLAGS.join(" ")} -o .swemock/a.out ${path} && ./.swemock/a.out`,
};
