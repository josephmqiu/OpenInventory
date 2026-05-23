/**
 * LanServerService lifecycle tests.
 *
 * Creates a real temp database and LAN server to verify:
 * - Auto-start when settings say enabled
 * - Start/stop via updateAccess
 * - Key regeneration
 * - Graceful shutdown
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import http from "http";
import { createTestDb, type TestDb } from "../setup/test-db";
import { makeDatabaseService } from "../../src/main/services/DatabaseService";
import { isPrivateLanIpv4, makeLanServerService, type LanServerServiceApi } from "../../src/main/services/LanServerService";

let t: TestDb;
let dbService: ReturnType<typeof makeDatabaseService>;
let lanService: LanServerServiceApi;

function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
  return Effect.runPromise(effect);
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    }).on("error", reject);
  });
}

beforeEach(() => {
  t = createTestDb();
  dbService = makeDatabaseService(t.dbPath);
  lanService = makeLanServerService(dbService, "");
});

afterEach(async () => {
  await run(lanService.shutdown());
  dbService.close();
  await t.cleanup();
});

describe("LanServerService", () => {
  it("keeps browser-facing URLs to private LAN IPv4 addresses", () => {
    expect(isPrivateLanIpv4("192.168.0.102")).toBe(true);
    expect(isPrivateLanIpv4("10.0.0.8")).toBe(true);
    expect(isPrivateLanIpv4("172.16.0.8")).toBe(true);
    expect(isPrivateLanIpv4("172.31.255.255")).toBe(true);
    expect(isPrivateLanIpv4("198.18.0.1")).toBe(false);
    expect(isPrivateLanIpv4("127.0.0.1")).toBe(false);
    expect(isPrivateLanIpv4("172.32.0.1")).toBe(false);
    expect(isPrivateLanIpv4("not-an-ip")).toBe(false);
  });

  it("starts in stopped state with no prior settings", async () => {
    const state = await run(lanService.loadState());
    expect(state.status).toBe("stopped");
    expect(state.enabled).toBe(false);
    expect(state.accessKey).toBeTruthy();
    expect(state.accessKey.length).toBe(24);
    expect(state.urls).toEqual([]);
  });

  it("auto-generates access key on first loadState", async () => {
    const state1 = await run(lanService.loadState());
    const state2 = await run(lanService.loadState());
    expect(state1.accessKey).toBe(state2.accessKey);
  });

  it("starts server via updateAccess({ enabled: true })", async () => {
    // loadState first to ensure access key is generated
    await run(lanService.loadState());
    const state = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    expect(state.status).toBe("running");
    expect(state.enabled).toBe(true);
    expect(state.urls.length).toBeGreaterThan(0);
  });

  it("serves API routes when running (requires auth)", async () => {
    const initial = await run(lanService.loadState());
    const state = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    expect(state.urls.length).toBeGreaterThan(0);

    const url = new URL(state.urls[0]);
    // Without access key → 401
    const noAuth = await httpGet(`http://127.0.0.1:${url.port}/api/health`);
    expect(noAuth.status).toBe(401);

    // With access key → 200
    const withAuth = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${url.port}/api/health`,
        { headers: { "x-inventory-key": initial.accessKey } },
        (res) => resolve({ status: res.statusCode ?? 0 }),
      );
      req.on("error", reject);
    });
    expect(withAuth.status).toBe(200);
  });

  it("stops server via updateAccess({ enabled: false })", async () => {
    await run(lanService.loadState());
    await run(lanService.updateAccess({ enabled: true, port: 0 }));
    const state = await run(lanService.updateAccess({ enabled: false, port: 0 }));
    expect(state.status).toBe("stopped");
    expect(state.urls).toEqual([]);
  });

  it("regenerates access key", async () => {
    const initial = await run(lanService.loadState());
    const regenerated = await run(lanService.regenerateAccessKey());
    expect(regenerated.accessKey).not.toBe(initial.accessKey);
    expect(regenerated.accessKey.length).toBe(24);
  });

  it("regenerates key and restarts when server is running", async () => {
    await run(lanService.loadState());
    await run(lanService.updateAccess({ enabled: true, port: 0 }));
    const state = await run(lanService.regenerateAccessKey());
    expect(state.status).toBe("running");
    expect(state.urls.length).toBeGreaterThan(0);
  });

  it("shutdown stops a running server cleanly", async () => {
    await run(lanService.loadState());
    const started = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    expect(started.status).toBe("running");

    await run(lanService.shutdown());
    // After shutdown, the internal server ref is null — next loadState will re-create
  });

  it("auto-starts on loadState when previously enabled", async () => {
    // Enable with a specific port to avoid port-0-in-DB issue
    await run(lanService.loadState());
    await run(lanService.updateAccess({ enabled: true, port: 51876 }));
    await run(lanService.shutdown());

    // Recreate service (simulating app restart) — use same DB
    const freshDbService = makeDatabaseService(t.dbPath);
    const freshService = makeLanServerService(freshDbService, "");

    const state = await run(freshService.loadState());
    expect(state.statusMessage).toBe("lanServerRunning");
    expect(state.status).toBe("running");
    expect(state.enabled).toBe(true);
    expect(state.urls.length).toBeGreaterThan(0);

    await run(freshService.shutdown());
    freshDbService.close();
  });
});
