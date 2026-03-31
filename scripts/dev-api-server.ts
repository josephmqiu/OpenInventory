/**
 * Standalone dev API server for browser preview.
 * Starts the same HTTP API as the LAN server but without authentication.
 * Used during development so the renderer can be previewed in a plain browser.
 */
import http from "http";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { makeDatabaseService } from "../src/main/services/DatabaseService";
import { runPendingMigrations } from "../src/main/infrastructure/migrations";

const PORT = 4123;
const DATA_DIR = path.join(process.cwd(), ".dev-data");
const DB_PATH = path.join(DATA_DIR, "inventory-monitor.db");
const SCHEMA_PATH = path.join(process.cwd(), "src/main/infrastructure/schema.sql");

// Initialize DB
fs.mkdirSync(DATA_DIR, { recursive: true });
const initDb = new Database(DB_PATH);
initDb.pragma("foreign_keys = ON");
if (fs.existsSync(SCHEMA_PATH)) {
  initDb.exec(fs.readFileSync(SCHEMA_PATH, "utf-8"));
}
runPendingMigrations(initDb);
initDb.close();

const dbService = makeDatabaseService(DB_PATH);

// Import helpers inline to avoid circular dependency with the router
import { Effect } from "effect";
import { errorToHttpStatus, type AppError } from "../src/main/domain/errors";

type Json = Record<string, unknown>;

async function runEffect<A>(effect: Effect.Effect<A, AppError>): Promise<A> {
  return Effect.runPromise(effect);
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

function readBody(req: http.IncomingMessage): Promise<Json> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
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
      const body = await readBody(req);
      const result = await runEffect(dbService.createInventoryItem(body as never));
      sendJson(res, 201, result.snapshot);
      return;
    }

    // Item routes
    const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemMatch && method === "PUT") {
      const body = await readBody(req);
      body.itemId = itemMatch[1];
      const result = await runEffect(dbService.updateInventoryItem(body as never));
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
      const body = await readBody(req);
      body.itemId = receiveMatch[1];
      const result = await runEffect(dbService.receiveStock(body as never));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // Issue material
    const issueMatch = pathname.match(/^\/api\/items\/([^/]+)\/issue$/);
    if (issueMatch && method === "POST") {
      const body = await readBody(req);
      body.itemId = issueMatch[1];
      const result = await runEffect(dbService.issueMaterial(body as never));
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
      const body = await readBody(req);
      const result = await runEffect(dbService.batchIssueMaterial(body as never));
      sendJson(res, 200, result.snapshot);
      return;
    }

    // Personnel
    if (pathname === "/api/personnel" && method === "POST") {
      const body = await readBody(req);
      sendJson(res, 201, await runEffect(dbService.addPersonnel(body as never)));
      return;
    }
    const personnelMatch = pathname.match(/^\/api\/personnel\/([^/]+)$/);
    if (personnelMatch && method === "DELETE") {
      sendJson(res, 200, await runEffect(dbService.removePersonnel(personnelMatch[1])));
      return;
    }

    // Backup
    if (pathname === "/api/backup-plan" && method === "PUT") {
      const body = await readBody(req);
      sendJson(res, 200, await runEffect(dbService.updateBackupPlan(body as never)));
      return;
    }
    if (pathname === "/api/backup-now" && method === "POST") {
      sendJson(res, 200, await runEffect(dbService.backupNow()));
      return;
    }

    // Language
    if (pathname === "/api/language" && method === "PUT") {
      const body = await readBody(req);
      await runEffect(dbService.updateLanguage(body.language as string));
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

    // Public issue
    const publicIssueMatch = pathname.match(/^\/public\/items\/([^/]+)\/issue$/);
    if (publicIssueMatch && method === "POST") {
      const body = await readBody(req);
      body.itemId = publicIssueMatch[1];
      const result = await runEffect(dbService.issueMaterial(body as never));
      sendJson(res, 200, result.snapshot);
      return;
    }

    sendJson(res, 404, { message: "Not found" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "_tag" in error) {
      const appError = error as AppError;
      sendJson(res, errorToHttpStatus(appError), { message: appError.message });
    } else {
      sendJson(res, 500, { message: String(error) });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Dev API server running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
