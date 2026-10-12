import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@swemock/shared"],
  serverExternalPackages: ["better-sqlite3"],
  // Migrations are read from disk at startup, so ship them with the standalone build.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  poweredByHeader: false,
};

export default config;
