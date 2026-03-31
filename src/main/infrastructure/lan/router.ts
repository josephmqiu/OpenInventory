import http from "http";
import fs from "fs";
import path from "path";
import { RateLimiter, getClientIp } from "./auth";
import type { DatabaseServiceApi, LanAccessSettings } from "../../services/DatabaseService";

type Json = Record<string, unknown>;

interface LanRouterDeps {
  dbService: DatabaseServiceApi;
  getAccessKey: () => string;
  rendererDir: string;
}

export function createLanRouter(deps: LanRouterDeps): http.RequestListener {
  const { dbService, getAccessKey, rendererDir } = deps;
  const rateLimiter = new RateLimiter();

  return async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    // ─── Public routes (no auth) ─────────────────────────────────────
    if (pathname.startsWith("/public/")) {
      await handlePublicRoute(pathname, method, req, res, dbService);
      return;
    }

    // ─── Static files (no auth for frontend assets) ──────────────────
    if (!pathname.startsWith("/api/")) {
      serveStaticFile(pathname, res, rendererDir);
      return;
    }

    // ─── Auth middleware ──────────────────────────────────────────────
    const accessKey = getAccessKey();
    const providedKey = req.headers["x-inventory-key"] as string ?? "";
    const ip = getClientIp(req);
    const authError = rateLimiter.authorize(ip, providedKey, accessKey);

    if (authError) {
      const status = authError.includes("Too many") ? 429 : 401;
      sendJson(res, status, { message: authError });
      return;
    }

    // ─── API routes ──────────────────────────────────────────────────
    await handleApiRoute(pathname, method, req, res, dbService);
  };
}

async function handleApiRoute(
  pathname: string,
  method: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: DatabaseServiceApi,
): Promise<void> {
  try {
    // GET /api/snapshot
    if (pathname === "/api/snapshot" && method === "GET") {
      const result = await runEffect(db.loadSnapshot());
      sendJson(res, 200, result);
      return;
    }

    // POST /api/items
    if (pathname === "/api/items" && method === "POST") {
      const body = await readBody(req);
      const result = await runEffect(db.createInventoryItem(body));
      sendJson(res, 201, result.snapshot);
      return;
    }

    // PUT /api/items/:id
    const itemPutMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemPutMatch && method === "PUT") {
      const body = await readBody(req);
      body.itemId = itemPutMatch[1];
      const result = await runEffect(db.updateInventoryItem(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // DELETE /api/items/:id
    if (itemPutMatch && method === "DELETE") {
      const result = await runEffect(db.removeInventoryItem(itemPutMatch[1]));
      sendJson(res, 200, result);
      return;
    }

    // POST /api/items/:id/receive
    const receiveMatch = pathname.match(/^\/api\/items\/([^/]+)\/receive$/);
    if (receiveMatch && method === "POST") {
      const body = await readBody(req);
      body.itemId = receiveMatch[1];
      const result = await runEffect(db.receiveStock(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // POST /api/items/:id/issue
    const issueMatch = pathname.match(/^\/api\/items\/([^/]+)\/issue$/);
    if (issueMatch && method === "POST") {
      const body = await readBody(req);
      body.itemId = issueMatch[1];
      const result = await runEffect(db.issueMaterial(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // GET /api/items/:id/movements
    const movementsMatch = pathname.match(/^\/api\/items\/([^/]+)\/movements$/);
    if (movementsMatch && method === "GET") {
      const result = await runEffect(db.getItemMovements(movementsMatch[1]));
      sendJson(res, 200, result);
      return;
    }

    // POST /api/items/batch-issue
    if (pathname === "/api/items/batch-issue" && method === "POST") {
      const body = await readBody(req);
      const result = await runEffect(db.batchIssueMaterial(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // POST /api/personnel
    if (pathname === "/api/personnel" && method === "POST") {
      const body = await readBody(req);
      const result = await runEffect(db.addPersonnel(body));
      sendJson(res, 201, result);
      return;
    }

    // DELETE /api/personnel/:id
    const personnelMatch = pathname.match(/^\/api\/personnel\/([^/]+)$/);
    if (personnelMatch && method === "DELETE") {
      const result = await runEffect(db.removePersonnel(personnelMatch[1]));
      sendJson(res, 200, result);
      return;
    }

    // PUT /api/backup-plan
    if (pathname === "/api/backup-plan" && method === "PUT") {
      const body = await readBody(req);
      const result = await runEffect(db.updateBackupPlan(body));
      sendJson(res, 200, result);
      return;
    }

    // POST /api/backup-now
    if (pathname === "/api/backup-now" && method === "POST") {
      const result = await runEffect(db.backupNow());
      sendJson(res, 200, result);
      return;
    }

    // PUT /api/language
    if (pathname === "/api/language" && method === "PUT") {
      const body = await readBody(req);
      await runEffect(db.updateLanguage(body.language as string));
      sendJson(res, 200, { ok: true });
      return;
    }

    // GET /api/health
    if (pathname === "/api/health" && method === "GET") {
      sendJson(res, 200, { status: "ready", storage: "sqlite-local" });
      return;
    }

    sendJson(res, 404, { message: "Not found" });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
}

async function handlePublicRoute(
  pathname: string,
  method: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: DatabaseServiceApi,
): Promise<void> {
  try {
    // GET /public/items/:id/context
    const contextMatch = pathname.match(/^\/public\/items\/([^/]+)\/context$/);
    if (contextMatch && method === "GET") {
      const itemId = contextMatch[1];
      const snapshot = await runEffect(db.loadSnapshot());
      const item = snapshot.items.find((i) => i.id === itemId);
      if (!item) {
        sendJson(res, 404, { message: "Item not found" });
        return;
      }
      sendJson(res, 200, {
        item,
        personnel: snapshot.personnel,
        language: snapshot.language,
      });
      return;
    }

    // POST /public/items/:id/issue
    const issueMatch = pathname.match(/^\/public\/items\/([^/]+)\/issue$/);
    if (issueMatch && method === "POST") {
      const body = await readBody(req);
      body.itemId = issueMatch[1];
      const result = await runEffect(db.issueMaterial(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    sendJson(res, 404, { message: "Not found" });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { Effect } from "effect";
import { errorToHttpStatus, type AppError } from "../../domain/errors";

async function runEffect<A>(effect: Effect.Effect<A, AppError>): Promise<A> {
  return Effect.runPromise(effect);
}

function handleApiError(res: http.ServerResponse, error: unknown): void {
  if (error && typeof error === "object" && "_tag" in error) {
    const appError = error as AppError;
    const status = errorToHttpStatus(appError);
    sendJson(res, status, { message: appError.message });
  } else {
    sendJson(res, 500, { message: String(error) });
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Json> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function serveStaticFile(pathname: string, res: http.ServerResponse, rendererDir: string): void {
  if (!rendererDir) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const resolvedBase = path.resolve(rendererDir);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.resolve(rendererDir, safePath.replace(/^\//, ""));

  // Block path traversal: resolved path must stay inside rendererDir.
  if (!filePath.startsWith(resolvedBase)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(resolvedBase, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    console.error(`[LAN] Static file not found: rendererDir=${rendererDir}, pathname=${pathname}`);
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
  };

  const contentType = mimeTypes[ext] ?? "application/octet-stream";
  let content: Buffer | string = fs.readFileSync(filePath);

  // Electron-vite builds with base="./" for file:// protocol. Rewrite to
  // absolute paths so the SPA works when served over HTTP on sub-routes.
  if (ext === ".html") {
    content = content
      .toString("utf-8")
      .replace(/\.\//g, "/")
      .replace('<html lang="en">', '<html lang="en" data-platform="web">');
  }

  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
}
