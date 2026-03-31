import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";

/** Copy src/main/infrastructure/ to out/main/infrastructure/ after build. */
function copyInfrastructurePlugin(): Plugin {
  return {
    name: "copy-infrastructure",
    closeBundle() {
      const src = resolve("src/main/infrastructure");
      const dest = resolve("out/main/infrastructure");
      fs.cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyInfrastructurePlugin()],
    build: {
      rollupOptions: {
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    build: {
      rollupOptions: {
        input: resolve("src/renderer/index.html"),
      },
    },
    plugins: [react()],
    server: {
      proxy: {
        "/api": "http://localhost:4123",
        "/public": "http://localhost:4123",
      },
    },
  },
});
