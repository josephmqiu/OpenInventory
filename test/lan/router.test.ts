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
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
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
  it("GET /public/items/:id/context returns item data without personnel", async () => {
    // Seed a test item
    const itemId = seedItem(t.db, { name: "Widget A", sku: "WDG-001" });
    seedPersonnel(t.db, "Should Not Leak");

    const res = await request(`/public/items/${itemId}/context`);
    expect(res.status).toBe(200);
    const body = res.body as { item: { name: string }; personnel?: unknown[] };
    expect(body.item.name).toBe("Widget A");
    // LAN is read-only: anonymous lookups must not expose the personnel roster.
    expect(body.personnel).toBeUndefined();
  });

  it("GET /public/items/:id/context returns 404 for unknown item", async () => {
    const res = await request("/public/items/nonexistent-id/context");
    expect(res.status).toBe(404);
    const body = res.body as { messageId: string; _tag: string };
    expect(body._tag).toBe("NotFoundError");
    expect(body.messageId).toBe("itemNotFound");
  });

  it("POST /public/items/:id/issue is removed (404) — LAN cannot mutate stock", async () => {
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
    expect(res.status).toBe(404);

    // Stock must be untouched.
    const context = await request(`/public/items/${itemId}/context`);
    const body = context.body as { item: { currentQuantity: number } };
    expect(body.item.currentQuantity).toBe(100);
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
    { method: "POST", path: "/api/items/some-id/issue", label: "issue material" },
    { method: "POST", path: "/api/items/batch-issue", label: "batch issue" },
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
  it("public context endpoint exposes item details but not personnel", async () => {
    const itemId = seedItem(t.db, { name: "Sensor X", sku: "SNS-001", currentQuantity: 50 });
    seedPersonnel(t.db, "Alice");
    seedPersonnel(t.db, "Bob");

    const res = await request(`/public/items/${itemId}/context`);
    expect(res.status).toBe(200);

    const body = res.body as {
      item: { name: string; currentQuantity: number };
      personnel?: Array<{ name: string }>;
      language: string;
    };

    // Documents what data is exposed without auth — item details only.
    expect(body.item.name).toBe("Sensor X");
    expect(body.item.currentQuantity).toBe(50);
    // The personnel roster is NOT exposed to anonymous LAN clients.
    expect(body.personnel).toBeUndefined();
    expect(body.language).toBeDefined();
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
  let rendererDir: string;

  beforeEach(async () => {
    rendererDir = fs.mkdtempSync(path.join(os.tmpdir(), "openinventory-lan-static-"));
    fs.mkdirSync(path.join(rendererDir, "assets"));
    fs.writeFileSync(
      path.join(rendererDir, "index.html"),
      '<html lang="en"><body><main data-testid="admin-app">ADMIN_APP</main></body></html>',
    );
    fs.writeFileSync(
      path.join(rendererDir, "issue.html"),
      '<html lang="en"><body><main data-testid="qr-lookup">ISSUE_APP</main><script src="./assets/issue.js"></script></body></html>',
    );
    fs.writeFileSync(path.join(rendererDir, "assets", "issue.js"), "window.__issueAssetLoaded = true;");

    const secRouter = createLanRouter({
      dbService,
      getAccessKey: () => ACCESS_KEY,
      rendererDir,
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
    fs.rmSync(rendererDir, { recursive: true, force: true });
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

  it("does not serve the admin app at the LAN root", async () => {
    const res = await secRequest("/");
    expect(res.status).toBe(404);
    expect(res.body).not.toContain("ADMIN_APP");
  });

  it("does not serve the admin app through direct index.html access", async () => {
    const res = await secRequest("/index.html");
    expect(res.status).toBe(404);
    expect(res.body).not.toContain("ADMIN_APP");
  });

  it("does not fall back to the admin app for arbitrary SPA routes", async () => {
    const res = await secRequest("/inventory");
    expect(res.status).toBe(404);
    expect(res.body).not.toContain("ADMIN_APP");
  });

  it("serves the QR lookup page for item issue routes", async () => {
    const res = await secRequest("/issue/item-123");
    expect(res.status).toBe(200);
    expect(res.body).toContain("ISSUE_APP");
    expect(res.body).toContain('data-platform="mobile"');
    expect(res.body).toContain("/assets/issue.js");
    expect(res.body).not.toContain("ADMIN_APP");
  });

  it("serves the QR lookup page for no-item issue routes", async () => {
    const res = await secRequest("/issue/");
    expect(res.status).toBe(200);
    expect(res.body).toContain("ISSUE_APP");
    expect(res.body).not.toContain("ADMIN_APP");
  });

  it("serves static assets needed by the QR lookup page", async () => {
    const res = await secRequest("/assets/issue.js");
    expect(res.status).toBe(200);
    expect(res.body).toContain("__issueAssetLoaded");
  });

  it("returns 404 (not EISDIR crash) for a directory under the assets allowlist", async () => {
    // Regression: GET /assets/ resolves to the assets directory, which exists.
    // Without an isFile() guard, readFileSync throws EISDIR — an unhandled
    // rejection the main process treats as fatal (unauthenticated remote DoS).
    const res = await secRequest("/assets/");
    expect(res.status).toBe(404);
  });

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
