import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Standalone Vite config for browser preview of the renderer.
 * Proxies /api/* and /public/* to the dev API server on port 4123.
 */
export default defineConfig({
  root: resolve("src/renderer"),
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://localhost:4123",
      "/public": "http://localhost:4123",
    },
  },
});
