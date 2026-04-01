import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { DatabaseService, type AppSnapshot, type DatabaseServiceApi, type LowStockNotification } from "../../src/main/services/DatabaseService";
import { NotificationService, type NotificationServiceApi } from "../../src/main/services/NotificationService";
import { LanServerService, type LanServerServiceApi } from "../../src/main/services/LanServerService";
import { registerIpcHandlers } from "../../src/main/ipc";
import { ValidationError } from "../../src/main/domain/errors";

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    handlers.set(channel, handler);
  });

  return {
    handlers,
    ipcMain: { handle },
  };
});

vi.mock("electron", () => ({
  ipcMain: electronMocks.ipcMain,
}));

const snapshot: AppSnapshot = {
  items: [],
  alerts: [],
  personnel: [],
  backupPlan: {
    targetPath: "",
    targetType: "local_folder",
    schedule: "",
    retention: "",
    lastSuccessfulBackup: "",
    nextScheduledBackup: "",
    status: "warning",
  },
  language: "en",
};

function makeMockDb(overrides: Partial<DatabaseServiceApi> = {}): DatabaseServiceApi {
  return {
    loadSnapshot: vi.fn(() => Effect.succeed(snapshot)),
    createInventoryItem: vi.fn(),
    updateInventoryItem: vi.fn(),
    receiveStock: vi.fn(),
    issueMaterial: vi.fn(),
    batchIssueMaterial: vi.fn(),
    getItemMovements: vi.fn(),
    updateBackupPlan: vi.fn(),
    backupNow: vi.fn(),
    updateLanguage: vi.fn(),
    removeInventoryItem: vi.fn(),
    addPersonnel: vi.fn(),
    removePersonnel: vi.fn(),
    loadLanAccessSettings: vi.fn(),
    saveLanAccessSettings: vi.fn(),
    getAuditMovements: vi.fn(),
    getAuditAnalytics: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as DatabaseServiceApi;
}

function makeMockLan(overrides: Partial<LanServerServiceApi> = {}): LanServerServiceApi {
  return {
    loadState: vi.fn(() => Effect.succeed({
      enabled: false,
      port: 4123,
      accessKey: "key",
      urls: [],
      status: "stopped" as const,
      statusMessage: "",
    })),
    updateAccess: vi.fn(),
    regenerateAccessKey: vi.fn(),
    shutdown: vi.fn(() => Effect.void),
    ...overrides,
  } as unknown as LanServerServiceApi;
}

function makeTestRuntime(
  db: DatabaseServiceApi,
  notifications: NotificationServiceApi,
  lan: LanServerServiceApi,
) {
  const layer = Layer.merge(
    Layer.succeed(DatabaseService, db),
    Layer.succeed(NotificationService, notifications),
  ).pipe(Layer.merge(Layer.succeed(LanServerService, lan)));

  return ManagedRuntime.make(layer);
}

const autoUpdateService = {
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  getStatus: vi.fn(),
};

beforeEach(() => {
  electronMocks.handlers.clear();
  electronMocks.ipcMain.handle.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("registerIpcHandlers", () => {
  it("delegates create-inventory-item to the database and notification services", async () => {
    const lowStockNotification: LowStockNotification = {
      itemName: "Bolts M6",
      sku: "SKU-001",
      currentQuantity: 4,
      thresholdQuantity: 10,
    };
    const db = makeMockDb({
      createInventoryItem: vi.fn(() => Effect.succeed({ snapshot, lowStockNotification })),
    });
    const notifications: NotificationServiceApi = {
      sendLowStockAlert: vi.fn(() => Effect.void),
    };
    const runtime = makeTestRuntime(db, notifications, makeMockLan());

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("create-inventory-item");
    expect(handler).toBeTruthy();

    const result = await handler?.({}, {
      input: {
        sku: "SKU-001",
        name: "Bolts M6",
        category: "",
        location: "",
        unit: "",
        supplier: "",
        reorderQuantity: 0,
        initialQuantity: 0,
      },
    });

    expect(db.createInventoryItem).toHaveBeenCalled();
    expect(notifications.sendLowStockAlert).toHaveBeenCalledWith(lowStockNotification);
    expect(result).toEqual({ ok: true, data: snapshot });

    await runtime.dispose();
  });

  it("returns typed error envelope from database handlers", async () => {
    const db = makeMockDb({
      loadSnapshot: vi.fn(() => Effect.fail(new ValidationError({ message: "Snapshot failed." }))),
    });
    const runtime = makeTestRuntime(
      db,
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("load-app-snapshot");
    const result = await handler?.();

    expect(result).toEqual({
      ok: false,
      error: { _tag: "ValidationError", message: "Snapshot failed." },
    });

    await runtime.dispose();
  });

  it("updates the shared LAN state when LAN access changes", async () => {
    const lanState = { primaryUrl: "" };
    const lanResponse = {
      enabled: true,
      port: 4123,
      accessKey: "lan-key",
      urls: ["http://127.0.0.1:4123"],
      status: "running" as const,
      statusMessage: "LAN server is running.",
    };
    const lan = makeMockLan({
      updateAccess: vi.fn(() => Effect.succeed(lanResponse)),
    });
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      lan,
    );

    registerIpcHandlers(runtime, lanState, autoUpdateService);

    const handler = electronMocks.handlers.get("update-lan-access");
    const result = await handler?.({}, { input: { enabled: true, port: 4123 } });

    expect(lan.updateAccess).toHaveBeenCalledWith({ enabled: true, port: 4123 });
    expect(result).toEqual({ ok: true, data: lanResponse });
    expect(lanState.primaryUrl).toBe("http://127.0.0.1:4123");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed create-inventory-item input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("create-inventory-item");
    // Missing required fields
    const result = await handler?.({}, { input: { name: 123 } });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed receive-stock input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("receive-stock");
    const result = await handler?.({}, { input: { quantity: "not-a-number" } });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed add-personnel input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("add-personnel");
    const result = await handler?.({}, { input: { name: 42 } });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed update-lan-access input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("update-lan-access");
    const result = await handler?.({}, { input: { enabled: "yes", port: "abc" } });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed update-app-language input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("update-app-language");
    const result = await handler?.({}, { language: "fr" });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed batch-issue-material input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("batch-issue-material");
    const result = await handler?.({}, { input: { items: "not-array" } });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed update-backup-plan input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("update-backup-plan");
    const result = await handler?.({}, { input: { targetType: "invalid_type" } });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed update-inventory-item input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("update-inventory-item");
    const result = await handler?.({}, { input: { itemId: 123 } });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });

  it("returns ValidationError envelope for malformed issue-material input", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("issue-material");
    const result = await handler?.({}, { input: {} });

    expect(result).toHaveProperty("ok", false);
    expect(result).toHaveProperty("error._tag", "ValidationError");

    await runtime.dispose();
  });
});
