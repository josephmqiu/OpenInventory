/**
 * LAN router HTTP integration tests.
 *
 * Starts a real HTTP server with the LAN router and verifies:
 * - Public routes accessible without auth
 * - API routes require auth key
 * - Rate limiting behavior
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import http from "http";
import { createTestDb, seedItem, type TestDb } from "../setup/test-db";
import { makeDatabaseService, type DatabaseServiceApi } from "../../src/main/services/DatabaseService";
import { createLanRouter } from "../../src/main/infrastructure/lan/router";

let t: TestDb;
let dbService: DatabaseServiceApi;
let server: http.Server;
let baseUrl: string;
const ACCESS_KEY = "test-access-key-12345678";

function request(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

beforeEach(async () => {
  t = createTestDb();
  dbService = makeDatabaseService(t.dbPath);

  const router = createLanRouter({
    dbService,
    getAccessKey: () => ACCESS_KEY,
    rendererDir: "",
  });

  server = http.createServer(router);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const addr = server.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  t.cleanup();
});

describe("LAN Router — public routes", () => {
  it("GET /public/items/:id/context returns item data", async () => {
    // Seed a test item
    const itemId = seedItem(t.db, { name: "Widget A", sku: "WDG-001" });

    const res = await request(`/public/items/${itemId}/context`);
    expect(res.status).toBe(200);
    const body = res.body as { item: { name: string }; personnel: unknown[] };
    expect(body.item.name).toBe("Widget A");
    expect(body.personnel).toBeDefined();
  });

  it("GET /public/items/:id/context returns 404 for unknown item", async () => {
    const res = await request("/public/items/nonexistent-id/context");
    expect(res.status).toBe(404);
  });

  it("POST /public/items/:id/issue issues material without auth", async () => {
    const itemId = seedItem(t.db, {
      name: "Widget B",
      sku: "WDG-002",
      currentQuantity: 100,
      reorderQuantity: 10,
    });

    const res = await request(`/public/items/${itemId}/issue`, {
      method: "POST",
      body: { quantity: 5, reason: "QR issue", performedBy: "tester" },
    });
    expect(res.status).toBe(200);
  });
});

describe("LAN Router — auth", () => {
  it("returns 401 for API routes without key", async () => {
    const res = await request("/api/health");
    expect(res.status).toBe(401);
  });

  it("returns 200 for API routes with correct key", async () => {
    const res = await request("/api/health", {
      headers: { "x-inventory-key": ACCESS_KEY },
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 for API routes with wrong key", async () => {
    const res = await request("/api/health", {
      headers: { "x-inventory-key": "wrong-key-000000000000" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 after repeated failed attempts", async () => {
    // Exhaust rate limit (5 attempts)
    for (let i = 0; i < 5; i++) {
      await request("/api/health", {
        headers: { "x-inventory-key": "wrong-key-000000000000" },
      });
    }
    // 6th attempt should be rate limited
    const res = await request("/api/health", {
      headers: { "x-inventory-key": "wrong-key-000000000000" },
    });
    expect(res.status).toBe(429);
  });
});

describe("LAN Router — API routes", () => {
  it("GET /api/snapshot returns inventory data", async () => {
    seedItem(t.db, { name: "Item 1", sku: "ITM-001" });

    const res = await request("/api/snapshot", {
      headers: { "x-inventory-key": ACCESS_KEY },
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ name: string }> };
    expect(body.items.length).toBe(1);
    expect(body.items[0].name).toBe("Item 1");
  });

  it("returns 404 for unknown API routes", async () => {
    const res = await request("/api/nonexistent", {
      headers: { "x-inventory-key": ACCESS_KEY },
    });
    expect(res.status).toBe(404);
  });
});
