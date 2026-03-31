import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Effect, Layer, Runtime } from "effect";
import { DatabaseService, type AppSnapshot, type DatabaseServiceApi, type LowStockNotification } from "../../src/main/services/DatabaseService";
import { NotificationService, type NotificationServiceApi } from "../../src/main/services/NotificationService";
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

async function makeRuntime(
  db: DatabaseServiceApi,
  notifications: NotificationServiceApi,
) {
  const layer = Layer.merge(
    Layer.succeed(DatabaseService, db),
    Layer.succeed(NotificationService, notifications),
  );

  return Effect.runPromise(
    Layer.toRuntime(layer).pipe(Effect.scoped),
  ) as Promise<Runtime.Runtime<DatabaseService | NotificationService>>;
}

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
    const db: DatabaseServiceApi = {
      loadSnapshot: vi.fn(() => Effect.succeed(snapshot)),
      createInventoryItem: vi.fn(() => Effect.succeed({ snapshot, lowStockNotification })),
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
      close: vi.fn(),
    } as unknown as DatabaseServiceApi;
    const notifications: NotificationServiceApi = {
      sendLowStockAlert: vi.fn(() => Effect.void),
    };
    const lanService = {
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
      shutdown: vi.fn(),
    };
    const autoUpdateService = {
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      getStatus: vi.fn(),
    };
    const runtime = await makeRuntime(db, notifications);

    registerIpcHandlers(runtime, lanService, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("create-inventory-item");
    expect(handler).toBeTruthy();

    const result = await handler?.({}, {
      input: {
        sku: "SKU-001",
        name: "Bolts M6",
      },
    });

    expect(db.createInventoryItem).toHaveBeenCalledWith({
      sku: "SKU-001",
      name: "Bolts M6",
    });
    expect(notifications.sendLowStockAlert).toHaveBeenCalledWith(lowStockNotification);
    expect(result).toEqual(snapshot);
  });

  it("serializes AppErrors from database handlers", async () => {
    const db: DatabaseServiceApi = {
      loadSnapshot: vi.fn(() => Effect.fail(new ValidationError({ message: "Snapshot failed." }))),
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
      close: vi.fn(),
    } as unknown as DatabaseServiceApi;
    const runtime = await makeRuntime(db, {
      sendLowStockAlert: vi.fn(() => Effect.void),
    });

    registerIpcHandlers(runtime, {
      loadState: vi.fn(),
      updateAccess: vi.fn(),
      regenerateAccessKey: vi.fn(),
      shutdown: vi.fn(),
    } as never, { primaryUrl: "" }, {
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      getStatus: vi.fn(),
    });

    const handler = electronMocks.handlers.get("load-app-snapshot");
    await expect(handler?.()).rejects.toBe("Snapshot failed.");
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
    const runtime = await makeRuntime({
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
      close: vi.fn(),
    } as unknown as DatabaseServiceApi, {
      sendLowStockAlert: vi.fn(() => Effect.void),
    });
    const lanService = {
      loadState: vi.fn(),
      updateAccess: vi.fn(() => Effect.succeed(lanResponse)),
      regenerateAccessKey: vi.fn(),
      shutdown: vi.fn(),
    };

    registerIpcHandlers(runtime, lanService as never, lanState, {
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      getStatus: vi.fn(),
    });

    const handler = electronMocks.handlers.get("update-lan-access");
    const result = await handler?.({}, { input: { enabled: true, port: 4123 } });

    expect(lanService.updateAccess).toHaveBeenCalledWith({ enabled: true, port: 4123 });
    expect(result).toEqual(lanResponse);
    expect(lanState.primaryUrl).toBe("http://127.0.0.1:4123");
  });
});
