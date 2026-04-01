import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import fs from "fs";

/** Rewrite /issue/* requests to serve issue.html through Vite's HTML pipeline.
 *  Registered BEFORE Vite's SPA fallback so it intercepts the route first. */
function issueRouteRewritePlugin(): Plugin {
  return {
    name: "issue-route-rewrite",
    configureServer(server) {
      // No return value = middleware runs BEFORE Vite's built-in SPA fallback
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

/**
 * Standalone Vite config for browser preview of the renderer.
 * Proxies /api/* and /public/* to the dev API server on port 4123.
 */
export default defineConfig({
  root: resolve("src/renderer"),
  plugins: [react(), issueRouteRewritePlugin()],
  build: {
    rollupOptions: {
      input: {
        index: resolve("src/renderer/index.html"),
        issue: resolve("src/renderer/issue.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://localhost:4123",
      "/public": "http://localhost:4123",
    },
  },
});
