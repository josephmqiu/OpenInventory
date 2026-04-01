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

/** Rewrite /issue/* requests to serve issue.html through Vite's HTML pipeline.
 *  Registered BEFORE Vite's SPA fallback so it intercepts the route first. */
function issueRouteRewritePlugin(): Plugin {
  return {
    name: "issue-route-rewrite",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && /^\/issue\/[^.]+/.test(req.url)) {
          const htmlPath = resolve("src/renderer/issue.html");
          let html = fs.readFileSync(htmlPath, "utf-8");
          html = await server.transformIndexHtml(req.url, html);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }
        next();
      });
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
        input: {
          index: resolve("src/renderer/index.html"),
          issue: resolve("src/renderer/issue.html"),
        },
      },
    },
    plugins: [react(), issueRouteRewritePlugin()],
    server: {
      proxy: {
        "/api": "http://localhost:4123",
        "/public": "http://localhost:4123",
      },
    },
  },
});
