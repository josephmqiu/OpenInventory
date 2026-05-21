import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Backend setup hooks create a SQLite DB and run all migrations, which can
    // exceed the 10s default hookTimeout on slow CI runners (Windows). Give the
    // migration-heavy setup headroom so it isn't racing the limit.
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
