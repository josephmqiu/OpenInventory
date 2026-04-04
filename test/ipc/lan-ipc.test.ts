/**
 * LAN IPC handler integration tests.
 *
 * Verifies that the LAN-related IPC handlers delegate to LanServerService
 * and keep the mutable LanState in sync.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import { createTestDb, type TestDb } from "../setup/test-db";
import { makeDatabaseService } from "../../src/main/services/DatabaseService";
import { makeLanServerService, type LanServerServiceApi, type LanAccessState } from "../../src/main/services/LanServerService";

interface LanState {
  primaryUrl: string;
}

let t: TestDb;
let dbService: ReturnType<typeof makeDatabaseService>;
let lanService: LanServerServiceApi;
let lanState: LanState;

function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
  return Effect.runPromise(effect);
}

/** Simulate what the IPC handler does: call lanService, update lanState. */
function updateLanState(state: LanAccessState): void {
  lanState.primaryUrl =
    state.status === "running" && state.urls.length > 0
      ? state.urls[0]
      : "";
}

beforeEach(() => {
  t = createTestDb();
  dbService = makeDatabaseService(t.dbPath);
  lanService = makeLanServerService(dbService, "");
  lanState = { primaryUrl: "" };
});

afterEach(async () => {
  await run(lanService.shutdown());
  dbService.close();
  await t.cleanup();
});

describe("LAN IPC handler delegation", () => {
  it("load-lan-access-state: populates lanState when server starts", async () => {
    // Pre-enable the server
    const started = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    updateLanState(started);
    expect(lanState.primaryUrl).toBeTruthy();
    expect(lanState.primaryUrl).toMatch(/^http:\/\//);
  });

  it("update-lan-access: enables server and populates lanState", async () => {
    expect(lanState.primaryUrl).toBe("");

    const state = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    updateLanState(state);

    expect(state.status).toBe("running");
    expect(lanState.primaryUrl).toBeTruthy();
  });

  it("update-lan-access: disables server and clears lanState", async () => {
    // Start first
    const started = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    updateLanState(started);
    expect(lanState.primaryUrl).toBeTruthy();

    // Stop
    const stopped = await run(lanService.updateAccess({ enabled: false, port: 0 }));
    updateLanState(stopped);
    expect(stopped.status).toBe("stopped");
    expect(lanState.primaryUrl).toBe("");
  });

  it("regenerate-lan-access-key: keeps server running with new key", async () => {
    const started = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    updateLanState(started);
    const oldKey = started.accessKey;
    const oldUrl = lanState.primaryUrl;

    const regenerated = await run(lanService.regenerateAccessKey());
    updateLanState(regenerated);

    expect(regenerated.accessKey).not.toBe(oldKey);
    expect(regenerated.status).toBe("running");
    expect(lanState.primaryUrl).toBeTruthy();
    // URL may change if port changes, but should still be set
    expect(lanState.primaryUrl).toMatch(/^http:\/\//);
  });

  it("lanState.primaryUrl drives QR code generation", async () => {
    const qrGenerator = (itemId: string, _sku: string) =>
      lanState.primaryUrl
        ? `${lanState.primaryUrl}/issue/${itemId}`
        : "";

    // Before enabling LAN
    expect(qrGenerator("item-1", "SKU")).toBe("");

    // Enable LAN
    const state = await run(lanService.updateAccess({ enabled: true, port: 0 }));
    updateLanState(state);

    const qrUrl = qrGenerator("item-1", "SKU");
    expect(qrUrl).toMatch(/\/issue\/item-1$/);
    expect(qrUrl).toContain(lanState.primaryUrl);

    // Disable LAN
    const stopped = await run(lanService.updateAccess({ enabled: false, port: 0 }));
    updateLanState(stopped);
    expect(qrGenerator("item-1", "SKU")).toBe("");
  });
});
