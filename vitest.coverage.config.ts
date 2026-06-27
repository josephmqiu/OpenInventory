import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: "v8",
      all: true,
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/main/**/*.ts",
        "src/preload/**/*.ts",
        "src/renderer/src/**/*.ts",
        "src/renderer/src/**/*.tsx",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
      ],
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 45,
        lines: 50,
      },
    },
    projects: [
      {
        test: {
          name: "renderer",
          environment: "jsdom",
          include: ["src/renderer/**/*.test.ts", "src/renderer/**/*.test.tsx"],
        },
      },
      {
        test: {
          name: "backend",
          environment: "node",
          include: ["test/**/*.test.ts"],
          // Mirror vitest.config.node.ts: the migration-heavy DB setup is slow on
          // Windows CI, and coverage instrumentation makes it slower still, so the
          // default 5s timeout flakes (e.g. DatabaseService migration tests).
          hookTimeout: 60000,
          testTimeout: 30000,
        },
      },
    ],
  },
});
