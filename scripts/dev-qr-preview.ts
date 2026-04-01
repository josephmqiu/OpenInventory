/**
 * Starts a Vite dev server on port 5174 that redirects "/" to an issue route.
 * Used by Claude Preview's qr-code-preview launch config.
 */
import { createServer } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import fs from "fs";
import type { Plugin } from "vite";

const PORT = 5174;

// Find the first item ID from the dev database to build the redirect URL
async function findFirstItemId(): Promise<string> {
  try {
    const res = await fetch(`http://localhost:4123/api/snapshot`);
    const data = (await res.json()) as { items: Array<{ id: string }> };
    return data.items[0]?.id ?? "demo-item";
  } catch {
    return "demo-item";
  }
}

function issueRoutePlugin(): Plugin {
  return {
    name: "qr-preview-rewrite",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Redirect root to an issue route
        if (req.url === "/" || req.url === "") {
          const itemId = await findFirstItemId();
          res.writeHead(302, { Location: `/issue/${itemId}` });
          res.end();
          return;
        }
        // Serve issue.html for /issue/* routes
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

const server = await createServer({
  root: resolve("src/renderer"),
  plugins: [react(), issueRoutePlugin()],
  server: {
    port: PORT,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4123",
      "/public": "http://localhost:4123",
    },
  },
});

await server.listen();
console.log(`QR code preview running at http://localhost:${PORT}`);
