/**
 * Standalone dev API server for browser preview.
 * Starts the same HTTP API as the LAN server but without authentication.
 * Used during development so the renderer can be previewed in a plain browser.
 */
import { execSync } from "child_process";
import { createRequire } from "module";

// Preflight: ensure better-sqlite3 is compiled for the current Node ABI.
// The Electron rebuild scripts may leave it compiled for a different ABI.
const _require = createRequire(import.meta.url);
try {
  _require("better-sqlite3");
} catch {
  console.log("Rebuilding better-sqlite3 for current Node ABI...");
  const npmPath = process.env.npm_execpath ?? "/opt/homebrew/bin/npm";
  execSync(`${npmPath} rebuild better-sqlite3`, { stdio: "inherit" });
  // Re-clear the module cache isn't possible for native addons — restart is needed.
  // Since this runs at startup before anything else, the execSync is blocking
  // and we can just re-require after rebuild.
  _require("better-sqlite3");
}

import http from "http";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { Schema } from "@effect/schema";
import { makeDatabaseService } from "../src/main/services/DatabaseService";
import { runPendingMigrations } from "../src/main/infrastructure/migrations";
import { configureSqlitePragmas } from "../src/main/infrastructure/sqlite-pragmas";
import { ValidationError } from "../src/main/domain/errors";
import {
  CreateInventoryItemBody,
  UpdateInventoryItemBody,
  StockMutationBody,
  BatchIssueMaterialBody,
  AddPersonnelBody,
  UpdateLanguageBody,
  UpdateBackupPlanBody,
  PublicIssueBody,
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
import { Effect } from "effect";
import { errorToHttpStatus, type AppError } from "../src/main/domain/errors";
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

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new ValidationError({ message: "Invalid JSON body" }));
      }
    });
    req.on("error", reject);
  });
}

function decodeBody<A, I>(schema: Schema.Schema<A, I>, raw: unknown): A {
  try {
    return Schema.decodeUnknownSync(schema)(raw);
  } catch (e) {
    throw new ValidationError({
      message: e instanceof Error ? e.message : "Invalid request body.",
    });
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

    // Create item
    if (pathname === "/api/items" && method === "POST") {
      const raw = await readBody(req);
      const body = decodeBody(CreateInventoryItemBody, raw);
      const result = await runEffect(dbService.createInventoryItem(body));
      sendJson(res, 201, result.snapshot);
      return;
    }

    // Item routes
    const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemMatch && method === "PUT") {
      const raw = await readBody(req);
      const decoded = decodeBody(UpdateInventoryItemBody, raw);
      const body = { ...decoded, itemId: itemMatch[1] };
      const result = await runEffect(dbService.updateInventoryItem(body));
      sendJson(res, 200, result.snapshot);
      return;
    }
    if (itemMatch && method === "DELETE") {
      sendJson(res, 200, await runEffect(dbService.removeInventoryItem(itemMatch[1])));
      return;
    }

    // Receive stock
    const receiveMatch = pathname.match(/^\/api\/items\/([^/]+)\/receive$/);
    if (receiveMatch && method === "POST") {
      const raw = await readBody(req);
      const decoded = decodeBody(StockMutationBody, raw);
      const body = { ...decoded, itemId: receiveMatch[1] };
      const result = await runEffect(dbService.receiveStock(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // Issue material
    const issueMatch = pathname.match(/^\/api\/items\/([^/]+)\/issue$/);
    if (issueMatch && method === "POST") {
      const raw = await readBody(req);
      const decoded = decodeBody(StockMutationBody, raw);
      const body = { ...decoded, itemId: issueMatch[1] };
      const result = await runEffect(dbService.issueMaterial(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // Movements
    const movementsMatch = pathname.match(/^\/api\/items\/([^/]+)\/movements$/);
    if (movementsMatch && method === "GET") {
      sendJson(res, 200, await runEffect(dbService.getItemMovements(movementsMatch[1])));
      return;
    }

    // Batch issue
    if (pathname === "/api/items/batch-issue" && method === "POST") {
      const raw = await readBody(req);
      const body = decodeBody(BatchIssueMaterialBody, raw);
      const result = await runEffect(dbService.batchIssueMaterial(body));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // Personnel
    if (pathname === "/api/personnel" && method === "POST") {
      const raw = await readBody(req);
      const body = decodeBody(AddPersonnelBody, raw);
      sendJson(res, 201, await runEffect(dbService.addPersonnel(body)));
      return;
    }
    const personnelMatch = pathname.match(/^\/api\/personnel\/([^/]+)$/);
    if (personnelMatch && method === "DELETE") {
      sendJson(res, 200, await runEffect(dbService.removePersonnel(personnelMatch[1])));
      return;
    }

    // Backup
    if (pathname === "/api/backup-plan" && method === "PUT") {
      const raw = await readBody(req);
      const body = decodeBody(UpdateBackupPlanBody, raw);
      sendJson(res, 200, await runEffect(dbService.updateBackupPlan(body)));
      return;
    }
    if (pathname === "/api/backup-now" && method === "POST") {
      sendJson(res, 200, await runEffect(dbService.backupNow()));
      return;
    }

    // Language
    if (pathname === "/api/language" && method === "PUT") {
      const raw = await readBody(req);
      const body = decodeBody(UpdateLanguageBody, raw);
      await runEffect(dbService.updateLanguage(body.language));
      sendJson(res, 200, { ok: true });
      return;
    }

    // Public issue context
    const contextMatch = pathname.match(/^\/public\/items\/([^/]+)\/context$/);
    if (contextMatch && method === "GET") {
      const snapshot = await runEffect(dbService.loadSnapshot());
      const item = snapshot.items.find((i) => i.id === contextMatch[1]);
      if (!item) {
        sendJson(res, 404, { message: "Item not found" });
        return;
      }
      sendJson(res, 200, { item, personnel: snapshot.personnel, language: snapshot.language });
      return;
    }

    // Public issue — return PublicIssueContext shape (not full snapshot)
    const publicIssueMatch = pathname.match(/^\/public\/items\/([^/]+)\/issue$/);
    if (publicIssueMatch && method === "POST") {
      const raw = await readBody(req);
      const body = decodeBody(PublicIssueBody, raw);
      const input = { ...body, itemId: publicIssueMatch[1] };
      const result = await runEffect(dbService.issueMaterial(input));
      const item = result.snapshot.items.find((i) => i.id === publicIssueMatch[1]);
      sendJson(res, 200, { item: item ?? null, personnel: result.snapshot.personnel, language: result.snapshot.language });
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
