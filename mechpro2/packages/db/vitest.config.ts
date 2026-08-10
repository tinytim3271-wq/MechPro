import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Integration tests share one Postgres database; run them serially.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
