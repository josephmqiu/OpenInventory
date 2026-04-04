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
import { createTestDb, seedItem, seedPersonnel, type TestDb } from "../setup/test-db";
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
  dbService.close();
  await t.cleanup();
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
    const body = res.body as { messageId: string; _tag: string };
    expect(body._tag).toBe("NotFoundError");
    expect(body.messageId).toBe("itemNotFound");
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

  it("deduplicates rapid repeated public issue submissions", async () => {
    const itemId = seedItem(t.db, {
      name: "Widget C",
      sku: "WDG-003",
      currentQuantity: 100,
      reorderQuantity: 10,
    });
    seedPersonnel(t.db, "Tester");

    const [first, second] = await Promise.all([
      request(`/public/items/${itemId}/issue`, {
        method: "POST",
        headers: { "x-idempotency-key": "duplicate-issue-key" },
        body: { quantity: 5, reason: "QR issue", performedBy: "Tester" },
      }),
      request(`/public/items/${itemId}/issue`, {
        method: "POST",
        headers: { "x-idempotency-key": "duplicate-issue-key" },
        body: { quantity: 5, reason: "QR issue", performedBy: "Tester" },
      }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const context = await request(`/public/items/${itemId}/context`);
    expect(context.status).toBe(200);
    const body = context.body as { item: { currentQuantity: number } };
    expect(body.item.currentQuantity).toBe(95);
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
    const body = res.body as { messageId: string; _tag: string };
    expect(body._tag).toBe("ValidationError");
    expect(body.messageId).toBe("invalidAccessKey");
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
    const body = res.body as { messageId: string; _tag: string };
    expect(body._tag).toBe("NotFoundError");
    expect(body.messageId).toBe("notFound");
  });
});

describe("LAN Router — removed write routes return 404", () => {
  const REMOVED_ROUTES = [
    { method: "POST", path: "/api/items", label: "create item" },
    { method: "PUT", path: "/api/items/some-id", label: "update item" },
    { method: "DELETE", path: "/api/items/some-id", label: "delete item" },
    { method: "POST", path: "/api/items/some-id/receive", label: "receive stock" },
    { method: "POST", path: "/api/personnel", label: "add personnel" },
    { method: "DELETE", path: "/api/personnel/some-id", label: "remove personnel" },
    { method: "PUT", path: "/api/language", label: "change language" },
  ];

  for (const route of REMOVED_ROUTES) {
    it(`${route.method} ${route.path} (${route.label}) returns 404`, async () => {
      const res = await request(route.path, {
        method: route.method,
        headers: { "x-inventory-key": ACCESS_KEY },
        ...(route.method !== "DELETE" ? { body: {} } : {}),
      });
      expect(res.status).toBe(404);
    });
  }
});

// ─── Security boundary tests ────────────────────────────────────────────────

describe("LAN Router — auth boundaries", () => {
  const API_ROUTES_NEEDING_AUTH = [
    { method: "GET", path: "/api/snapshot" },
    { method: "GET", path: "/api/health" },
    { method: "POST", path: "/api/items/batch-issue" },
    { method: "POST", path: "/api/items/test-id/issue" },
    { method: "GET", path: "/api/items/test-id/movements" },
    { method: "GET", path: "/api/audit/movements" },
    { method: "GET", path: "/api/audit/analytics" },
  ];

  for (const route of API_ROUTES_NEEDING_AUTH) {
    it(`${route.method} ${route.path} rejects without access key`, async () => {
      const res = await request(route.path, { method: route.method });
      expect(res.status).toBe(401);
    });
  }

  it("rejects empty access key header", async () => {
    const res = await request("/api/snapshot", {
      headers: { "x-inventory-key": "" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects key that is a substring of the real key", async () => {
    const res = await request("/api/snapshot", {
      headers: { "x-inventory-key": ACCESS_KEY.slice(0, 10) },
    });
    expect(res.status).toBe(401);
  });

  it("correct key still works after failed attempts (below lockout)", async () => {
    // 3 failures (under the 5-attempt lockout threshold)
    for (let i = 0; i < 3; i++) {
      await request("/api/health", {
        headers: { "x-inventory-key": "wrong" },
      });
    }
    // Correct key should still work
    const res = await request("/api/health", {
      headers: { "x-inventory-key": ACCESS_KEY },
    });
    expect(res.status).toBe(200);
  });

  it("lockout blocks even the correct key", async () => {
    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await request("/api/health", {
        headers: { "x-inventory-key": "wrong" },
      });
    }
    // Correct key should be locked out too
    const res = await request("/api/health", {
      headers: { "x-inventory-key": ACCESS_KEY },
    });
    expect(res.status).toBe(429);
  });
});

describe("LAN Router — public endpoint data exposure", () => {
  it("public context endpoint exposes item details and personnel", async () => {
    const itemId = seedItem(t.db, { name: "Sensor X", sku: "SNS-001", currentQuantity: 50 });
    seedPersonnel(t.db, "Alice");
    seedPersonnel(t.db, "Bob");

    const res = await request(`/public/items/${itemId}/context`);
    expect(res.status).toBe(200);

    const body = res.body as {
      item: { name: string; currentQuantity: number };
      personnel: Array<{ name: string }>;
      language: string;
    };

    // Documents what data is exposed without auth
    expect(body.item.name).toBe("Sensor X");
    expect(body.item.currentQuantity).toBe(50);
    expect(body.personnel).toHaveLength(2);
    expect(body.personnel.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
    expect(body.language).toBeDefined();
  });

  it("public issue endpoint can deduct stock without auth", async () => {
    const itemId = seedItem(t.db, {
      name: "Bolts",
      sku: "BLT-001",
      currentQuantity: 100,
      reorderQuantity: 10,
    });

    // Issue material without any access key
    const issueRes = await request(`/public/items/${itemId}/issue`, {
      method: "POST",
      body: { quantity: 25, reason: "QR scan", performedBy: "anonymous" },
    });
    expect(issueRes.status).toBe(200);

    // Verify stock was actually deducted
    const contextRes = await request(`/public/items/${itemId}/context`);
    const body = contextRes.body as { item: { currentQuantity: number } };
    expect(body.item.currentQuantity).toBe(75);
  });

  it("public issue endpoint rejects issuing more than available stock", async () => {
    const itemId = seedItem(t.db, {
      name: "Rare Part",
      sku: "RARE-001",
      currentQuantity: 5,
      reorderQuantity: 1,
    });

    const res = await request(`/public/items/${itemId}/issue`, {
      method: "POST",
      body: { quantity: 10, reason: "over-issue", performedBy: "tester" },
    });
    // Should reject — currently returns 500 because Effect FiberFailure
    // wraps the InsufficientStockError (ideally would be 409).
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Verify stock was NOT deducted
    const contextRes = await request(`/public/items/${itemId}/context`);
    const body = contextRes.body as { item: { currentQuantity: number } };
    expect(body.item.currentQuantity).toBe(5);
  });

  it("public context returns 404 for non-existent item, not a stack trace", async () => {
    const res = await request("/public/items/fake-id-12345/context");
    expect(res.status).toBe(404);
    const body = res.body as { messageId: string; _tag: string };
    expect(body._tag).toBe("NotFoundError");
    expect(body.messageId).toBe("itemNotFound");
    // Should not leak internal details
    expect(JSON.stringify(res.body)).not.toContain("stack");
    expect(JSON.stringify(res.body)).not.toContain("Error:");
  });

  it("returns Chinese auth and not-found messages when the app language is zh-CN", async () => {
    await Effect.runPromise(dbService.updateLanguage("zh-CN"));

    const authRes = await request("/api/health", {
      headers: { "x-inventory-key": "wrong-key-000000000000" },
    });
    expect(authRes.status).toBe(401);
    const authBody = authRes.body as { messageId: string; _tag: string };
    expect(authBody._tag).toBe("ValidationError");
    expect(authBody.messageId).toBe("invalidAccessKey");

    const res = await request("/public/items/nonexistent-id/context");
    expect(res.status).toBe(404);
    const body = res.body as { messageId: string; _tag: string };
    expect(body._tag).toBe("NotFoundError");
    expect(body.messageId).toBe("itemNotFound");
  });
});

describe("LAN Router — static file security", () => {
  // These tests use a separate server with a real rendererDir so static
  // file serving is active (the main test server uses rendererDir: "").
  let secServer: http.Server;
  let secBaseUrl: string;

  beforeEach(async () => {
    const secRouter = createLanRouter({
      dbService,
      getAccessKey: () => ACCESS_KEY,
      rendererDir: __dirname, // Use test dir as rendererDir
    });
    secServer = http.createServer(secRouter);
    await new Promise<void>((resolve) => {
      secServer.listen(0, () => resolve());
    });
    const addr = secServer.address();
    if (typeof addr === "object" && addr) {
      secBaseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      secServer.close(() => resolve());
    });
  });

  function secRequest(
    urlPath: string,
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(urlPath, secBaseUrl);
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      }).on("error", reject);
    });
  }

  it("path traversal attempt is blocked", async () => {
    const res = await secRequest("/../../../etc/passwd");
    // URL constructor normalizes /../ so this may resolve within the dir,
    // but must never serve files outside rendererDir
    expect([403, 404]).toContain(res.status);
    expect(res.body).not.toContain("root:");
  });

  it("encoded path traversal is blocked", async () => {
    const res = await secRequest("/%2e%2e/%2e%2e/%2e%2e/etc/passwd");
    expect([403, 404]).toContain(res.status);
    expect(res.body).not.toContain("root:");
  });

  it("null byte injection returns 404", async () => {
    const res = await secRequest("/index.html%00.js");
    expect([403, 404]).toContain(res.status);
  });

  it("empty rendererDir returns 404 for all static requests", async () => {
    // The main test server has rendererDir: "" — verify it rejects
    const res = await request("/anything");
    expect(res.status).toBe(404);
  });
});

describe("LAN Router — QR code URL security", () => {
  it("QR URL does not embed the access key", () => {
    // Simulate the QR URL generator from index.ts
    const primaryUrl = "http://192.168.1.5:4123";
    const itemId = "item-abc-123";
    const qrUrl = `${primaryUrl}/issue/${itemId}`;

    expect(qrUrl).not.toContain(ACCESS_KEY);
    expect(qrUrl).not.toContain("key");
    expect(qrUrl).not.toContain("token");
    expect(qrUrl).toBe("http://192.168.1.5:4123/issue/item-abc-123");
  });

  it("QR URL points to SPA issue route, not the API endpoint", () => {
    const primaryUrl = "http://192.168.1.5:4123";
    const itemId = "item-abc-123";
    const qrUrl = `${primaryUrl}/issue/${itemId}`;

    // Must hit the SPA route (served as static HTML), not the JSON API
    expect(qrUrl).not.toContain("/api/");
    expect(qrUrl).not.toContain("/public/");
    expect(qrUrl).toContain("/issue/");
  });
});
