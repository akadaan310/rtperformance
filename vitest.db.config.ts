import { defineConfig } from "vitest/config";
import path from "node:path";

/** Integration tests against a running Supabase-compatible stack (npm run stack:start). */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    setupFiles: ["tests/support/load-env.ts"],
  },
});
