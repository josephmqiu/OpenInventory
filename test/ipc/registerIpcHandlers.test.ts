import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import fs from "fs";
import os from "os";
import path from "path";
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
    dialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
    },
    BrowserWindow: {
      getFocusedWindow: vi.fn(() => ({ id: 1 })),
      getAllWindows: vi.fn(() => [{ id: 1 }]),
    },
    app: {
      getVersion: vi.fn(() => "0.1.5"),
    },
  };
});

vi.mock("electron", () => ({
  ipcMain: electronMocks.ipcMain,
  dialog: electronMocks.dialog,
  BrowserWindow: electronMocks.BrowserWindow,
  app: electronMocks.app,
}));

const snapshot: AppSnapshot = {
  items: [],
  alerts: [],
  personnel: [],
  backupPlan: {
    targetPath: "",
    schedule: { intervalValue: 0, intervalUnit: "hours", onStartup: false },
    lastSuccessfulBackup: "",
    lastFileSize: 0,
    lastVerified: false,
    lastError: "",
    status: "warning",
    cloudProvider: "",
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

function makeMockBackupCoordinator() {
  return {
    backupNow: vi.fn(async () => snapshot),
    validateBackup: vi.fn(async () => ({
      validation: { valid: true },
      comparison: {
        backup: {
          createdAt: "2026-04-01T12:00:00Z",
          items: 1,
          movements: 2,
          personnel: 1,
          schemaVersion: 7,
          appVersion: "0.0.4",
        },
        current: {
          lastActivity: "2026-04-02T12:00:00Z",
          items: 1,
          movements: 3,
          personnel: 1,
        },
        backupIsNewer: false,
      },
    })),
    restoreFromBackup: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  electronMocks.handlers.clear();
  electronMocks.ipcMain.handle.mockClear();
  electronMocks.dialog.showOpenDialog.mockReset();
  electronMocks.dialog.showSaveDialog.mockReset();
  electronMocks.BrowserWindow.getFocusedWindow.mockClear();
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
      loadSnapshot: vi.fn(() =>
        Effect.fail(new ValidationError({ messageId: "serverError", debugMessage: "Snapshot failed." })),
      ),
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
      error: {
        _tag: "ValidationError",
        messageId: "serverError",
        messageValues: undefined,
        debugMessage: "Snapshot failed.",
      },
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

  it("exports a single QR label after save dialog confirmation", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-export-single-"));
    const outputPath = path.join(tempDir, "SKU-BOLTS-M6 - Bolts M6.png");
    electronMocks.dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: outputPath,
    });

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("export-qr-label");
    const result = await handler?.({}, {
      label: {
        suggestedFileName: "SKU-BOLTS-M6 - Bolts M6.png",
        pngDataUrl: "data:image/png;base64,aGVsbG8=",
      },
    });

    expect(result).toEqual({ ok: true, data: outputPath });
    expect(electronMocks.dialog.showSaveDialog).toHaveBeenCalledOnce();
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath)).toEqual(Buffer.from("hello"));

    fs.rmSync(tempDir, { recursive: true, force: true });
    await runtime.dispose();
  });

  it("returns null when single label export is canceled", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    electronMocks.dialog.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    });

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("export-qr-label");
    const result = await handler?.({}, {
      label: {
        suggestedFileName: "SKU-BOLTS-M6 - Bolts M6.png",
        pngDataUrl: "data:image/png;base64,aGVsbG8=",
      },
    });

    expect(result).toEqual({ ok: true, data: null });

    await runtime.dispose();
  });

  it("exports multiple QR labels into the selected folder with deduped filenames", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-export-batch-"));
    electronMocks.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [tempDir],
    });

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("export-qr-labels");
    const result = await handler?.({}, {
      labels: [
        {
          suggestedFileName: "SKU-BOLTS-M6 - Bolts M6.png",
          pngDataUrl: "data:image/png;base64,Zmlyc3Q=",
        },
        {
          suggestedFileName: "SKU-BOLTS-M6 - Bolts M6.png",
          pngDataUrl: "data:image/png;base64,c2Vjb25k",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      data: [
        path.join(tempDir, "SKU-BOLTS-M6 - Bolts M6.png"),
        path.join(tempDir, "SKU-BOLTS-M6 - Bolts M6 (2).png"),
      ],
    });
    expect(fs.readFileSync(path.join(tempDir, "SKU-BOLTS-M6 - Bolts M6.png"))).toEqual(Buffer.from("first"));
    expect(fs.readFileSync(path.join(tempDir, "SKU-BOLTS-M6 - Bolts M6 (2).png"))).toEqual(Buffer.from("second"));

    fs.rmSync(tempDir, { recursive: true, force: true });
    await runtime.dispose();
  });

  it("selects a backup directory from the native dialog", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    electronMocks.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/backups"],
    });

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("select-backup-directory");
    await expect(handler?.()).resolves.toEqual({ ok: true, data: "/tmp/backups" });

    await runtime.dispose();
  });

  it("returns null when no desktop window is focused for backup directory selection", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    electronMocks.BrowserWindow.getFocusedWindow.mockReturnValueOnce(null);
    electronMocks.BrowserWindow.getAllWindows.mockReturnValueOnce([]);

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("select-backup-directory");
    await expect(handler?.()).resolves.toEqual({ ok: true, data: null });

    await runtime.dispose();
  });

  it("selects a restore source from the native dialog", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    electronMocks.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/restore-source"],
    });

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("select-restore-source");
    await expect(handler?.()).resolves.toEqual({ ok: true, data: "/tmp/restore-source" });

    await runtime.dispose();
  });

  it("uses the backup coordinator for backup-now when available", async () => {
    const coordinator = makeMockBackupCoordinator();
    const runtime = makeTestRuntime(
      makeMockDb({
        backupNow: vi.fn(() => Effect.fail(new Error("Should not use db.backupNow"))),
      }),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService, coordinator as never);

    const handler = electronMocks.handlers.get("backup-now");
    await expect(handler?.()).resolves.toEqual({ ok: true, data: snapshot });
    expect(coordinator.backupNow).toHaveBeenCalledOnce();

    await runtime.dispose();
  });

  it("delegates validate-backup to the backup coordinator", async () => {
    const coordinator = makeMockBackupCoordinator();
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService, coordinator as never);

    const handler = electronMocks.handlers.get("validate-backup");
    const result = await handler?.({}, { dirPath: "/tmp/restore-source" });

    expect(coordinator.validateBackup).toHaveBeenCalledWith("/tmp/restore-source");
    expect(result).toMatchObject({ ok: true });

    await runtime.dispose();
  });

  it("returns a typed error when validate-backup is requested without a coordinator", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("validate-backup");
    const result = await handler?.({}, { dirPath: "/tmp/restore-source" });

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: "ValidationError",
        messageId: "backupCoordinatorUnavailable",
        messageValues: undefined,
        debugMessage: "Backup coordinator not available",
      },
    });

    await runtime.dispose();
  });

  it("delegates restore-from-backup to the backup coordinator", async () => {
    const coordinator = makeMockBackupCoordinator();
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService, coordinator as never);

    const handler = electronMocks.handlers.get("restore-from-backup");
    await expect(handler?.({}, { dirPath: "/tmp/restore-source" })).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(coordinator.restoreFromBackup).toHaveBeenCalledWith("/tmp/restore-source");

    await runtime.dispose();
  });

  it("loads audit movements and analytics through the database runtime", async () => {
    const auditRows = { rows: [], total: 0, summary: { totalMovements: 0, totalReceived: 0, totalIssued: 0, uniqueItems: 0, uniquePersonnel: 0 } };
    const analytics = { summary: auditRows.summary, personnelActivity: [], itemActivity: [], anomalyMovements: [] };
    const db = makeMockDb({
      getAuditMovements: vi.fn(() => Effect.succeed(auditRows)),
      getAuditAnalytics: vi.fn(() => Effect.succeed(analytics)),
    });
    const runtime = makeTestRuntime(
      db,
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const getMovements = electronMocks.handlers.get("get-audit-movements");
    const getAnalytics = electronMocks.handlers.get("get-audit-analytics");

    await expect(getMovements?.({}, { filters: { page: 1, pageSize: 50 } })).resolves.toEqual({
      ok: true,
      data: auditRows,
    });
    await expect(getAnalytics?.({}, { filters: { movementType: "issue" } })).resolves.toEqual({
      ok: true,
      data: analytics,
    });

    expect(db.getAuditMovements).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
    expect(db.getAuditAnalytics).toHaveBeenCalledWith({ movementType: "issue" });

    await runtime.dispose();
  });

  it("registers auto-update handlers as fire-and-forget commands", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );

    autoUpdateService.getStatus.mockReturnValue({ stage: "downloaded", version: "0.1.5" });
    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    await electronMocks.handlers.get("check-for-updates")?.();
    await electronMocks.handlers.get("download-update")?.();
    await electronMocks.handlers.get("install-update")?.();

    expect(autoUpdateService.checkForUpdates).toHaveBeenCalledOnce();
    expect(autoUpdateService.downloadUpdate).toHaveBeenCalledOnce();
    expect(autoUpdateService.installUpdate).toHaveBeenCalledOnce();

    await runtime.dispose();
  });

  it("exposes the app version and current update status", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    autoUpdateService.getStatus.mockReturnValue({ stage: "downloaded", version: "0.1.5" });

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const version = await electronMocks.handlers.get("get-app-version")?.();
    const status = await electronMocks.handlers.get("get-update-status")?.();

    expect(version).toBe("0.1.5");
    expect(status).toEqual({ stage: "downloaded", version: "0.1.5" });
    expect(autoUpdateService.getStatus).toHaveBeenCalled();

    await runtime.dispose();
  });

  it("returns null when batch export is canceled", async () => {
    const runtime = makeTestRuntime(
      makeMockDb(),
      { sendLowStockAlert: vi.fn(() => Effect.void) },
      makeMockLan(),
    );
    electronMocks.dialog.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    registerIpcHandlers(runtime, { primaryUrl: "" }, autoUpdateService);

    const handler = electronMocks.handlers.get("export-qr-labels");
    const result = await handler?.({}, {
      labels: [
        {
          suggestedFileName: "SKU-BOLTS-M6 - Bolts M6.png",
          pngDataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });

    expect(result).toEqual({ ok: true, data: null });

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
    const result = await handler?.({}, { input: { intervalUnit: "invalid_unit" } });

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
