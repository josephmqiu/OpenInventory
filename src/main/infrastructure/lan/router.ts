import http from "http";
import fs from "fs";
import path from "path";
import { Schema } from "@effect/schema";
import { RateLimiter, getClientIp } from "./auth";
import type { DatabaseServiceApi } from "../../services/DatabaseService";
import type { AuditMovementFilters, PublicIssueContext } from "../../../shared/types";
import {
  backendMessages,
  normalizeBackendLanguage,
  notFoundError,
  serializeAppError,
  validationError,
} from "../../domain/errors";
import {
  StockMutationBody,
  BatchIssueMaterialBody,
  PublicIssueBody,
} from "../../../shared/schemas";

interface LanRouterDeps {
  dbService: DatabaseServiceApi;
  getAccessKey: () => string;
  rendererDir: string;
}

export function createLanRouter(deps: LanRouterDeps): http.RequestListener {
  const { dbService, getAccessKey, rendererDir } = deps;
  const rateLimiter = new RateLimiter();
  const pendingPublicIssues = new Map<string, Promise<PublicIssueContext>>();
  const recentPublicIssues = new Map<string, { response: PublicIssueContext; completedAt: number }>();
  const PUBLIC_ISSUE_REPLAY_WINDOW_MS = 1500;

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
      await handlePublicRoute(pathname, method, req, res, dbService, messages, pendingPublicIssues, recentPublicIssues, PUBLIC_ISSUE_REPLAY_WINDOW_MS);
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
    await handleApiRoute(pathname, method, url, req, res, dbService, messages);
  };
}

async function handleApiRoute(
  pathname: string,
  method: string,
  url: URL,
  req: http.IncomingMessage,
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

    // POST /api/items/:id/issue
    const issueMatch = pathname.match(/^\/api\/items\/([^/]+)\/issue$/);
    if (issueMatch && method === "POST") {
      const raw = await readBody(req, messages);
      const decoded = decodeBody(StockMutationBody, raw);
      const body = { ...decoded, itemId: issueMatch[1] };
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
      const raw = await readBody(req, messages);
      const body = decodeBody(BatchIssueMaterialBody, raw);
      const result = await runEffect(db.batchIssueMaterial(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // Personnel, item CRUD, receive, language, and backup endpoints are
    // desktop-only (IPC) — not exposed over LAN.

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
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: DatabaseServiceApi,
  messages: ReturnType<typeof backendMessages>,
  pendingPublicIssues: Map<string, Promise<PublicIssueContext>>,
  recentPublicIssues: Map<string, { response: PublicIssueContext; completedAt: number }>,
  PUBLIC_ISSUE_REPLAY_WINDOW_MS: number,
): Promise<void> {
  try {
    // GET /public/items/:id/context
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
        personnel: snapshot.personnel,
        language: snapshot.language,
      });
      return;
    }

    // POST /public/items/:id/issue
    const issueMatch = pathname.match(/^\/public\/items\/([^/]+)\/issue$/);
    if (issueMatch && method === "POST") {
      const raw = await readBody(req, messages);
      const body = decodeBody(PublicIssueBody, raw);
      const input = { ...body, itemId: issueMatch[1] };
      const idempotencyKey = (req.headers["x-idempotency-key"] as string | undefined)?.trim();
      const dedupeKey = idempotencyKey || `public-issue:${issueMatch[1]}:${body.quantity}:${body.performedBy.trim()}`;
      const recentRequest = recentPublicIssues.get(dedupeKey);

      if (recentRequest && Date.now() - recentRequest.completedAt <= PUBLIC_ISSUE_REPLAY_WINDOW_MS) {
        sendJson(res, 200, recentRequest.response);
        return;
      }

      const existingRequest = pendingPublicIssues.get(dedupeKey);

      const request = existingRequest ?? (async () => {
        const result = await runEffect(db.issueMaterial(input));
        // Return PublicIssueContext shape (not the full snapshot) so the
        // frontend can update the QuickIssuePage with the refreshed item.
        const item = result.snapshot.items.find((i) => i.id === issueMatch[1]);
        return {
          item: item ?? null,
          personnel: result.snapshot.personnel,
          language: result.snapshot.language,
        };
      })();

      if (!existingRequest) {
        pendingPublicIssues.set(dedupeKey, request);
      }

      try {
        const response = await request;
        recentPublicIssues.set(dedupeKey, { response, completedAt: Date.now() });
        sendJson(res, 200, response);
      } finally {
        if (!existingRequest) {
          pendingPublicIssues.delete(dedupeKey);
        }
      }
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

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function readBody(
  req: http.IncomingMessage,
  messages: ReturnType<typeof backendMessages>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer | string) => {
      bytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(validationError(messages.requestBodyTooLarge));
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(validationError(messages.invalidJsonBody));
      }
    });
    req.on("error", reject);
  });
}

function decodeBody<A, I>(schema: Schema.Schema<A, I>, raw: unknown): A {
  try {
    return Schema.decodeUnknownSync(schema)(raw);
  } catch (e) {
    throw validationError("invalidRequestBody", undefined, e instanceof Error ? e.message : "Invalid request body.");
  }
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
  const safePath = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.resolve(rendererDir, safePath.replace(/^\//, ""));

  // Block path traversal: resolved path must stay inside rendererDir.
  if (!filePath.startsWith(resolvedBase)) {
    res.writeHead(403);
    res.end(messages.forbidden);
    return;
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback: serve issue.html for /issue/* routes, index.html for everything else
    const fallbackFile = pathname.startsWith("/issue/") ? "issue.html" : "index.html";
    filePath = path.join(resolvedBase, fallbackFile);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`[LAN] Static file not found: rendererDir=${rendererDir}, pathname=${pathname}`);
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
