import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Backend setup/teardown hooks create a SQLite DB, run all migrations, and on
    // teardown delete temp DB files. On Windows CI, file-handle release + Defender
    // scanning under parallel load can make the teardown rmSync retry-loop slow
    // (observed >30s when many SQLite-heavy files run concurrently). Give the
    // migration- and IO-heavy hooks headroom so they aren't racing the limit.
    hookTimeout: 60000,
    testTimeout: 15000,
  },
});
