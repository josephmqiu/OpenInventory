import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    projects: [
      {
        extends: "./vitest.config.ts",
        test: {
          name: "renderer",
        },
      },
      {
        extends: "./vitest.config.node.ts",
        test: {
          name: "backend",
        },
      },
    ],
  },
});
