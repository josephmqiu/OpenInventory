import http from "http";
import fs from "fs";
import path from "path";
import { RateLimiter, getClientIp } from "./auth";
import type { DatabaseServiceApi } from "../../services/DatabaseService";
import type { AuditMovementFilters } from "../../../shared/types";
import { toPublicCatalogItem } from "../../../shared/publicCatalog";
import {
  backendMessages,
  normalizeBackendLanguage,
  notFoundError,
  serializeAppError,
} from "../../domain/errors";

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

    // ─── Static files (no auth, no DB read needed) ───────────────────
    if (!pathname.startsWith("/api/") && !pathname.startsWith("/public/")) {
      serveStaticFile(pathname, res, rendererDir, backendMessages());
      return;
    }

    // ─── Resolve DB messages for API/public routes ───────────────────
    const messages = await resolveMessages(dbService);

    // ─── Public routes (no auth) ─────────────────────────────────────
    if (pathname.startsWith("/public/")) {
      await handlePublicRoute(pathname, method, res, dbService, messages);
      return;
    }

    // ─── Auth middleware ──────────────────────────────────────────────
    const accessKey = getAccessKey();
    const providedKey = req.headers["x-inventory-key"] as string ?? "";
    const ip = getClientIp(req);
    const authError = rateLimiter.authorize(ip, providedKey, accessKey);

    if (authError) {
      const status = authError === "too_many_failed_attempts" ? 429 : 401;
      sendJson(res, status, {
        _tag: "ValidationError",
        messageId:
          status === 429 ? messages.tooManyFailedAccessKeyAttempts : messages.invalidAccessKey,
      });
      return;
    }

    // ─── API routes ──────────────────────────────────────────────────
    await handleApiRoute(pathname, method, url, res, dbService, messages);
  };
}

async function handleApiRoute(
  pathname: string,
  method: string,
  url: URL,
  res: http.ServerResponse,
  db: DatabaseServiceApi,
  messages: ReturnType<typeof backendMessages>,
): Promise<void> {
  try {
    // GET /api/snapshot
    if (pathname === "/api/snapshot" && method === "GET") {
      const result = await runEffect(db.loadSnapshot());
      sendJson(res, 200, result);
      return;
    }

    // GET /api/items/:id/movements
    const movementsMatch = pathname.match(/^\/api\/items\/([^/]+)\/movements$/);
    if (movementsMatch && method === "GET") {
      const result = await runEffect(db.getItemMovements(movementsMatch[1]));
      sendJson(res, 200, result);
      return;
    }

    // LAN is read-only: all stock writes (issue, batch-issue, receive), item
    // CRUD, personnel, language, and backup are desktop-only (IPC). The admin
    // is the sole mutator of inventory state. LAN clients can look up and audit.

    // GET /api/audit/movements
    if (pathname === "/api/audit/movements" && method === "GET") {
      const sortDir = url.searchParams.get("sortDir");
      const filters: AuditMovementFilters = {
        dateFrom: url.searchParams.get("dateFrom") || undefined,
        dateTo: url.searchParams.get("dateTo") || undefined,
        movementType: (url.searchParams.get("movementType") as "receive" | "issue") || undefined,
        itemId: url.searchParams.get("itemId") || undefined,
        itemSearch: url.searchParams.get("itemSearch") || undefined,
        performedBy: url.searchParams.get("performedBy") || undefined,
        textSearch: url.searchParams.get("textSearch") || undefined,
        sortBy: url.searchParams.get("sortBy") || undefined,
        sortDir: sortDir === "asc" || sortDir === "desc" ? sortDir : undefined,
        page: parseInt(url.searchParams.get("page") ?? "1", 10),
        pageSize: Math.min(parseInt(url.searchParams.get("pageSize") ?? "50", 10), 10000),
      };
      const result = await runEffect(db.getAuditMovements(filters));
      sendJson(res, 200, result);
      return;
    }

    // GET /api/audit/analytics
    if (pathname === "/api/audit/analytics" && method === "GET") {
      const filters = {
        dateFrom: url.searchParams.get("dateFrom") || undefined,
        dateTo: url.searchParams.get("dateTo") || undefined,
        movementType: (url.searchParams.get("movementType") as "receive" | "issue") || undefined,
        itemId: url.searchParams.get("itemId") || undefined,
        itemSearch: url.searchParams.get("itemSearch") || undefined,
        performedBy: url.searchParams.get("performedBy") || undefined,
        textSearch: url.searchParams.get("textSearch") || undefined,
      };
      const result = await runEffect(db.getAuditAnalytics(filters));
      sendJson(res, 200, result);
      return;
    }

    // GET /api/health
    if (pathname === "/api/health" && method === "GET") {
      sendJson(res, 200, { status: "ready", storage: "sqlite-local" });
      return;
    }

    sendJson(res, 404, serializeAppError(notFoundError(messages.notFound)));
  } catch (error: unknown) {
    handleApiError(res, error, messages);
  }
}

async function handlePublicRoute(
  pathname: string,
  method: string,
  res: http.ServerResponse,
  db: DatabaseServiceApi,
  messages: ReturnType<typeof backendMessages>,
): Promise<void> {
  try {
    // GET /public/items — read-only catalog for QR-scan browse/search. Lets a
    // floor worker who scanned one item (or opened the generic lookup URL) search
    // the rest without re-scanning. Still read-only; the admin is the sole mutator.
    // The response is built EXPLICITLY ({ items, language, currency }) — never the
    // whole snapshot — so personnel/backupPlan/lanAccess never leak to anon clients.
    if (pathname === "/public/items" && method === "GET") {
      const snapshot = await runEffect(db.loadSnapshot());
      sendJson(res, 200, {
        items: snapshot.items.map(toPublicCatalogItem),
        language: snapshot.language,
        currency: snapshot.currency,
      });
      return;
    }

    // GET /public/items/:id/context — read-only item lookup for QR scans.
    const contextMatch = pathname.match(/^\/public\/items\/([^/]+)\/context$/);
    if (contextMatch && method === "GET") {
      const itemId = contextMatch[1];
      const snapshot = await runEffect(db.loadSnapshot());
      const item = snapshot.items.find((i) => i.id === itemId);
      if (!item) {
        sendJson(res, 404, serializeAppError(notFoundError(messages.itemNotFound)));
        return;
      }
      sendJson(res, 200, {
        item,
        language: snapshot.language,
        currency: snapshot.currency,
      });
      return;
    }

    sendJson(res, 404, serializeAppError(notFoundError(messages.notFound)));
  } catch (error: unknown) {
    handleApiError(res, error, messages);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { Effect } from "effect";
import { errorToHttpStatus, type AppError } from "../../domain/errors";

async function runEffect<A>(effect: Effect.Effect<A, AppError>): Promise<A> {
  return Effect.runPromise(effect);
}

async function resolveMessages(db: DatabaseServiceApi): Promise<ReturnType<typeof backendMessages>> {
  try {
    const snapshot = await runEffect(db.loadSnapshot());
    return backendMessages(normalizeBackendLanguage(snapshot.language));
  } catch {
    return backendMessages("en");
  }
}

function handleApiError(
  res: http.ServerResponse,
  error: unknown,
  messages: ReturnType<typeof backendMessages>,
): void {
  if (error && typeof error === "object" && "_tag" in error) {
    const appError = error as AppError;
    const status = errorToHttpStatus(appError);
    sendJson(res, status, serializeAppError(appError));
  } else {
    sendJson(res, 500, {
      _tag: "ServerError",
      messageId: messages.unexpectedError,
      debugMessage: String(error),
    });
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(JSON.stringify(body));
}

function serveStaticFile(
  pathname: string,
  res: http.ServerResponse,
  rendererDir: string,
  messages: ReturnType<typeof backendMessages>,
): void {
  if (!rendererDir) {
    res.writeHead(404);
    res.end(messages.notFound);
    return;
  }

  const resolvedBase = path.resolve(rendererDir);
  const filePath = resolveLanStaticFile(pathname, resolvedBase);

  if (!filePath) {
    res.writeHead(404);
    res.end(messages.notFound);
    return;
  }

  // Block path traversal: resolved path must stay inside rendererDir.
  if (!isPathInsideBase(filePath, resolvedBase)) {
    res.writeHead(403);
    res.end(messages.forbidden);
    return;
  }

  // Must resolve to a regular file. statSync throws for missing paths; a
  // directory (e.g. GET /assets/) would otherwise reach readFileSync below and
  // throw EISDIR — an unhandled rejection that the main process treats as
  // fatal (index.ts), turning any unauthenticated LAN request into an app crash.
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    console.error(`[LAN] Static file not found: rendererDir=${rendererDir}, pathname=${pathname}`);
    res.writeHead(404);
    res.end(messages.notFound);
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end(messages.notFound);
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
    const platform = path.basename(filePath) === "issue.html" ? "mobile" : "web";
    content = content
      .toString("utf-8")
      .replace(/\.\//g, "/")
      .replace(/<html lang="en"(?: data-platform="[^"]*")?>/,
        `<html lang="en" data-platform="${platform}">`);
  }

  const contentBuffer = typeof content === "string" ? Buffer.from(content) : content;
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(contentBuffer).toString(),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(contentBuffer);
}

function resolveLanStaticFile(pathname: string, resolvedBase: string): string | null {
  if (
    pathname === "/issue.html" ||
    pathname === "/issue" ||
    pathname === "/issue/" ||
    /^\/issue\/[^/]+\/?$/.test(pathname)
  ) {
    return path.join(resolvedBase, "issue.html");
  }

  if (pathname.startsWith("/assets/") || pathname === "/favicon.ico") {
    return path.resolve(resolvedBase, pathname.replace(/^\//, ""));
  }

  return null;
}

function isPathInsideBase(filePath: string, resolvedBase: string): boolean {
  const relative = path.relative(resolvedBase, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
