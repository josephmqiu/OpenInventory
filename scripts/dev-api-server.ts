/**
 * Standalone dev API server for browser preview.
 * Starts a local development HTTP API without authentication.
 * Used during development so the renderer can be previewed in a plain browser.
 *
 * This intentionally supports the full admin UI against .dev-data. Production
 * LAN serving is handled by src/main/infrastructure/lan/router.ts and remains
 * QR/read-only.
 */
import { execFileSync } from "child_process";
import { createRequire } from "module";

// Preflight: ensure better-sqlite3 is compiled for the current Node ABI.
// The Electron rebuild scripts may leave it compiled for a different ABI.
//
// NOTE: require() only loads the JS wrapper — the native .node binary is
// dlopen'd lazily on the first `new Database()`. So a require() that succeeds
// does NOT prove the ABI matches. We must actually construct a database to
// trigger the load; otherwise a wrong-ABI binary slips past this check and
// crashes later (which broke spinning up the preview on a fresh run).
const _require = createRequire(import.meta.url);
function ensureNodeAbiBinary(): void {
  const probe = () => {
    const BetterSqlite3 = _require("better-sqlite3");
    new BetterSqlite3(":memory:").close();
  };
  try {
    probe();
  } catch {
    console.log("Rebuilding better-sqlite3 for current Node ABI...");
    const npmPath = process.env.npm_execpath ?? "/opt/homebrew/bin/npm";
    execFileSync(npmPath, ["rebuild", "better-sqlite3"], { stdio: "inherit" });
    // The previous dlopen failed (not cached), so constructing again now loads
    // the freshly rebuilt binary. This also surfaces a clear error if the
    // rebuild somehow didn't take, instead of crashing deeper in startup.
    probe();
  }
}
ensureNodeAbiBinary();

import http from "http";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { makeDatabaseService } from "../src/main/services/DatabaseService";
import { toPublicCatalogItem } from "../src/shared/publicCatalog";
import { runPendingMigrations } from "../src/main/infrastructure/migrations";
import { configureSqlitePragmas } from "../src/main/infrastructure/sqlite-pragmas";
import {
  AddPersonnelBody,
  BatchIssueMaterialBody,
  CreateInventoryItemBody,
  StockMutationBody,
  UpdateBackupPlanBody,
  UpdateInventoryItemBody,
  UpdateLanguageBody,
} from "../src/shared/schemas";

const PORT = 4123;
const DATA_DIR = path.join(process.cwd(), ".dev-data");
const DB_PATH = path.join(DATA_DIR, "inventory-monitor.db");
const SCHEMA_PATH = path.join(process.cwd(), "src/main/infrastructure/schema.sql");

// Initialize DB
fs.mkdirSync(DATA_DIR, { recursive: true });
const initDb = new Database(DB_PATH);
configureSqlitePragmas(initDb);
if (fs.existsSync(SCHEMA_PATH)) {
  initDb.exec(fs.readFileSync(SCHEMA_PATH, "utf-8"));
}
runPendingMigrations(initDb);
initDb.close();

const dbService = makeDatabaseService(DB_PATH);

// Import helpers inline to avoid circular dependency with the router
import { Schema } from "@effect/schema";
import { Effect } from "effect";
import { errorToHttpStatus, type AppError, validationError } from "../src/main/domain/errors";
import { BackupService, BackupServiceLive } from "../src/main/services/BackupService";

type Json = Record<string, unknown>;

async function runEffect<A>(effect: Effect.Effect<A, AppError, BackupService>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, BackupServiceLive));
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(validationError("invalidInput", undefined, "Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function decodeBody<A, I>(schema: Schema.Schema<A, I>, body: unknown): A {
  try {
    return Schema.decodeUnknownSync(schema)(body);
  } catch (error) {
    throw validationError(
      "invalidInput",
      undefined,
      error instanceof Error ? error.message : "Invalid request body.",
    );
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    });
    res.end();
    return;
  }

  try {
    // Health
    if (pathname === "/api/health") {
      sendJson(res, 200, { status: "ready", storage: "sqlite-local" });
      return;
    }

    // Snapshot
    if (pathname === "/api/snapshot" && method === "GET") {
      sendJson(res, 200, await runEffect(dbService.loadSnapshot()));
      return;
    }

    // Movements
    const movementsMatch = pathname.match(/^\/api\/items\/([^/]+)\/movements$/);
    if (movementsMatch && method === "GET") {
      sendJson(res, 200, await runEffect(dbService.getItemMovements(movementsMatch[1])));
      return;
    }

    // Development-only browser preview mutators. Production LAN routes stay
    // read-only in src/main/infrastructure/lan/router.ts; this server is only
    // started by npm run dev/npm run dev:api against .dev-data.
    if (pathname === "/api/items" && method === "POST") {
      const input = decodeBody(CreateInventoryItemBody, await readJsonBody(req));
      const result = await runEffect(dbService.createInventoryItem(input));
      sendJson(res, 200, result.snapshot);
      return;
    }

    const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemMatch && method === "PUT") {
      const body = decodeBody(UpdateInventoryItemBody, await readJsonBody(req));
      const result = await runEffect(dbService.updateInventoryItem({ ...body, itemId: itemMatch[1] }));
      sendJson(res, 200, result.snapshot);
      return;
    }

    if (itemMatch && method === "DELETE") {
      const snapshot = await runEffect(dbService.removeInventoryItem(itemMatch[1]));
      sendJson(res, 200, snapshot);
      return;
    }

    const receiveMatch = pathname.match(/^\/api\/items\/([^/]+)\/receive$/);
    if (receiveMatch && method === "POST") {
      const body = decodeBody(StockMutationBody, await readJsonBody(req));
      const result = await runEffect(dbService.receiveStock({ ...body, itemId: receiveMatch[1] }));
      sendJson(res, 200, result.snapshot);
      return;
    }

    const issueMatch = pathname.match(/^\/api\/items\/([^/]+)\/issue$/);
    if (issueMatch && method === "POST") {
      const body = decodeBody(StockMutationBody, await readJsonBody(req));
      const result = await runEffect(dbService.issueMaterial({ ...body, itemId: issueMatch[1] }));
      sendJson(res, 200, result.snapshot);
      return;
    }

    if (pathname === "/api/items/batch-issue" && method === "POST") {
      const input = decodeBody(BatchIssueMaterialBody, await readJsonBody(req));
      const result = await runEffect(dbService.batchIssueMaterial(input));
      sendJson(res, 200, result.snapshot);
      return;
    }

    if (pathname === "/api/personnel" && method === "POST") {
      const input = decodeBody(AddPersonnelBody, await readJsonBody(req));
      const snapshot = await runEffect(dbService.addPersonnel(input));
      sendJson(res, 200, snapshot);
      return;
    }

    const personnelMatch = pathname.match(/^\/api\/personnel\/([^/]+)$/);
    if (personnelMatch && method === "DELETE") {
      const snapshot = await runEffect(dbService.removePersonnel(personnelMatch[1]));
      sendJson(res, 200, snapshot);
      return;
    }

    const movementMatch = pathname.match(/^\/api\/movements\/([^/]+)$/);
    if (movementMatch && method === "DELETE") {
      const result = await runEffect(dbService.deleteMovement(movementMatch[1]));
      sendJson(res, 200, result.snapshot);
      return;
    }

    if (pathname === "/api/backup-plan" && method === "PUT") {
      const input = decodeBody(UpdateBackupPlanBody, await readJsonBody(req));
      sendJson(res, 200, await runEffect(dbService.updateBackupPlan(input)));
      return;
    }

    if (pathname === "/api/backup-now" && method === "POST") {
      sendJson(res, 200, await runEffect(dbService.backupNow()));
      return;
    }

    if (pathname === "/api/language" && method === "PUT") {
      const { language } = decodeBody(UpdateLanguageBody, await readJsonBody(req));
      await runEffect(dbService.updateLanguage(language));
      sendJson(res, 200, { ok: true });
      return;
    }

    // Public catalog — read-only browse/search for QR scans (no auth). Mirrors the
    // production LAN route's explicit projection (omits qrCodeDataUrl; never the
    // whole snapshot) so the preview exercises the real public shape.
    if (pathname === "/public/items" && method === "GET") {
      const snapshot = await runEffect(dbService.loadSnapshot());
      const items = snapshot.items.map(toPublicCatalogItem);
      sendJson(res, 200, { items, language: snapshot.language, currency: snapshot.currency });
      return;
    }

    // Public item context — read-only lookup for QR scans (no auth, no personnel).
    const contextMatch = pathname.match(/^\/public\/items\/([^/]+)\/context$/);
    if (contextMatch && method === "GET") {
      const snapshot = await runEffect(dbService.loadSnapshot());
      const item = snapshot.items.find((i) => i.id === contextMatch[1]);
      if (!item) {
        sendJson(res, 404, { message: "Item not found" });
        return;
      }
      sendJson(res, 200, { item, language: snapshot.language, currency: snapshot.currency });
      return;
    }

    // Audit movements
    if (pathname === "/api/audit/movements" && method === "GET") {
      const filters = {
        dateFrom: url.searchParams.get("dateFrom") || undefined,
        dateTo: url.searchParams.get("dateTo") || undefined,
        movementType: (url.searchParams.get("movementType") as "receive" | "issue") || undefined,
        itemId: url.searchParams.get("itemId") || undefined,
        itemSearch: url.searchParams.get("itemSearch") || undefined,
        performedBy: url.searchParams.get("performedBy") || undefined,
        textSearch: url.searchParams.get("textSearch") || undefined,
        page: parseInt(url.searchParams.get("page") ?? "1", 10),
        pageSize: Math.min(parseInt(url.searchParams.get("pageSize") ?? "50", 10), 10000),
      };
      sendJson(res, 200, await runEffect(dbService.getAuditMovements(filters)));
      return;
    }

    // Audit analytics
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
      sendJson(res, 200, await runEffect(dbService.getAuditAnalytics(filters)));
      return;
    }

    sendJson(res, 404, { message: "Not found" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "_tag" in error) {
      const appError = error as AppError;
      sendJson(res, errorToHttpStatus(appError), { _tag: appError._tag, message: appError.message });
    } else {
      sendJson(res, 500, { _tag: "ServerError", message: String(error) });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Dev API server running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
