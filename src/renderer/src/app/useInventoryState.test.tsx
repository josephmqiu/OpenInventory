import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppSnapshot,
  InventoryAlert,
  InventoryItem,
  LanAccessState,
  PersonnelMember,
} from "../domain/models";

const runtimeMocks = vi.hoisted(() => ({
  detectRuntime: vi.fn(),
  isDevPreviewRuntime: vi.fn(),
}));

const gatewayMocks = vi.hoisted(() => ({
  addPersonnel: vi.fn(),
  backupNow: vi.fn(),
  batchIssueMaterial: vi.fn(),
  clearLanAccessKey: vi.fn(),
  createInventoryItem: vi.fn(),
  issueMaterial: vi.fn(),
  issueMaterialPublic: vi.fn(),
  isUnauthorizedError: vi.fn(),
  loadAppSnapshot: vi.fn(),
  loadLanAccessState: vi.fn(),
  loadPublicIssueContext: vi.fn(),
  persistLanAccessKey: vi.fn(),
  readPersistedLanAccessKey: vi.fn(),
  readPersistedLanguage: vi.fn(),
  receiveStock: vi.fn(),
  regenerateLanAccessKey: vi.fn(),
  removeInventoryItem: vi.fn(),
  removePersonnel: vi.fn(),
  deleteMovement: vi.fn(),
  restoreFromBackup: vi.fn(),
  selectBackupDirectory: vi.fn(),
  selectRestoreSource: vi.fn(),
  updateAppLanguage: vi.fn(),
  updateAppCurrency: vi.fn(),
  updateBackupPlan: vi.fn(),
  updateInventoryItem: vi.fn(),
  updateLanAccess: vi.fn(),
  validateBackup: vi.fn(),
}));

vi.mock("./runtime", () => runtimeMocks);
vi.mock("../services/inventoryGateway", async () => {
  const actual = await vi.importActual<typeof import("../services/inventoryGateway")>(
    "../services/inventoryGateway",
  );

  return {
    ...actual,
    ...gatewayMocks,
  };
});

import { i18n } from "./i18n";
import { useInventoryState } from "./useInventoryState";
import { GatewayError } from "../services/inventoryGateway";

const tCommon = i18n.getFixedT("en", "common");
const tInventory = i18n.getFixedT("en", "inventory");
const tBackup = i18n.getFixedT("en", "backup");
const baseItem: InventoryItem = {
  id: "item-1",
  sku: "SKU-001",
  qrCodeDataUrl: "http://127.0.0.1:4123/issue/item-1",
  name: "Bolts M6",
  category: "Parts",
  location: "Warehouse A",
  unit: "pcs",
  supplier: "Fasteners Inc.",
  currentQuantity: 15,
  reorderQuantity: 10,
  unitPriceMinor: null,
  status: "in_stock",
  lastUpdated: "2026-03-31T10:00:00Z",
};
const basePersonnel: PersonnelMember = {
  id: "person-1",
  name: "Alice",
};
const baseLanAccessState: LanAccessState = {
  enabled: false,
  port: 4123,
  accessKey: "access-key-123",
  urls: [],
  status: "stopped",
  statusMessage: "LAN server is stopped.",
};

function createSnapshot(overrides: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    items: [baseItem],
    alerts: [],
    personnel: [basePersonnel],
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
    currency: "CNY",
    ...overrides,
  };
}

function createLowStockAlert(overrides: Partial<InventoryAlert> = {}): InventoryAlert {
  return {
    id: "alert-1",
    itemName: baseItem.name,
    sku: baseItem.sku,
    currentQuantity: 5,
    thresholdQuantity: baseItem.reorderQuantity,
    status: "open",
    triggeredAt: "2026-03-31T11:00:00Z",
    ...overrides,
  };
}

let visibilityState: DocumentVisibilityState = "visible";
const originalLocation = window.location;

beforeEach(() => {
  cleanup();
  visibilityState = "visible";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL("https://inventory.example.com/") as unknown as Location,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });

  runtimeMocks.detectRuntime.mockReturnValue("http");
  runtimeMocks.isDevPreviewRuntime.mockReturnValue(false);

  gatewayMocks.addPersonnel.mockResolvedValue(createSnapshot());
  gatewayMocks.backupNow.mockResolvedValue(createSnapshot());
  gatewayMocks.batchIssueMaterial.mockResolvedValue(createSnapshot());
  gatewayMocks.clearLanAccessKey.mockImplementation(() => {});
  gatewayMocks.createInventoryItem.mockResolvedValue(createSnapshot());
  gatewayMocks.issueMaterial.mockResolvedValue(createSnapshot());
  gatewayMocks.issueMaterialPublic.mockResolvedValue({
    item: baseItem,
    personnel: [basePersonnel],
    language: "en",
  });
  gatewayMocks.isUnauthorizedError.mockImplementation(
    (error: unknown) => error instanceof GatewayError && error.status === 401,
  );
  gatewayMocks.loadAppSnapshot.mockResolvedValue(createSnapshot());
  gatewayMocks.loadLanAccessState.mockResolvedValue(baseLanAccessState);
  gatewayMocks.loadPublicIssueContext.mockResolvedValue({
    item: baseItem,
    personnel: [basePersonnel],
    language: "en",
  });
  gatewayMocks.persistLanAccessKey.mockImplementation(() => {});
  gatewayMocks.readPersistedLanAccessKey.mockReturnValue("persisted-access-key");
  gatewayMocks.readPersistedLanguage.mockReturnValue("en");
  gatewayMocks.receiveStock.mockResolvedValue(createSnapshot());
  gatewayMocks.regenerateLanAccessKey.mockResolvedValue({
    ...baseLanAccessState,
    accessKey: "regenerated-key",
  });
  gatewayMocks.removeInventoryItem.mockResolvedValue(createSnapshot({ items: [] }));
  gatewayMocks.removePersonnel.mockResolvedValue(createSnapshot({ personnel: [] }));
  gatewayMocks.deleteMovement.mockResolvedValue(createSnapshot());
  gatewayMocks.restoreFromBackup.mockResolvedValue(undefined);
  gatewayMocks.selectBackupDirectory.mockResolvedValue("/tmp/openinventory-backups");
  gatewayMocks.selectRestoreSource.mockResolvedValue(null);
  gatewayMocks.updateAppLanguage.mockResolvedValue(undefined);
  gatewayMocks.updateAppCurrency.mockResolvedValue(undefined);
  gatewayMocks.updateBackupPlan.mockResolvedValue(createSnapshot());
  gatewayMocks.updateInventoryItem.mockResolvedValue(createSnapshot());
  gatewayMocks.updateLanAccess.mockResolvedValue({
    ...baseLanAccessState,
    enabled: true,
    status: "running",
    statusMessage: "LAN server is running.",
    urls: ["http://127.0.0.1:4123"],
  });
  gatewayMocks.validateBackup.mockResolvedValue({
    validation: { valid: true },
    comparison: {
      backup: {
        createdAt: "2026-03-31T09:00:00Z",
        items: 1,
        movements: 2,
        personnel: 1,
        schemaVersion: 4,
        appVersion: "0.0.4",
      },
      current: {
        lastActivity: "2026-03-31T10:00:00Z",
        items: 1,
        movements: 3,
        personnel: 1,
      },
      backupIsNewer: false,
    },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.clearAllMocks();
});

describe("useInventoryState", () => {
  it("requires browser auth when HTTP runtime has no persisted access key", async () => {
    gatewayMocks.readPersistedLanAccessKey.mockReturnValue("");

    const { result } = renderHook(() => useInventoryState());

    expect(result.current.requiresBrowserAuth).toBe(true);
    expect(result.current.snapshot).toBeNull();
    await waitFor(() => {
      expect(gatewayMocks.loadAppSnapshot).not.toHaveBeenCalled();
    });
  });

  it("clears persisted browser auth after an unauthorized snapshot load", async () => {
    gatewayMocks.loadAppSnapshot.mockRejectedValueOnce(
      new GatewayError("Invalid access key.", 401),
    );

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(gatewayMocks.clearLanAccessKey).toHaveBeenCalledOnce();
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.accessKeyInput).toBe("");
    expect(result.current.loadError).toBeNull();
    expect(result.current.actionError).toBeNull();
  });

  it("adds a warning notice when a mutation creates a new low-stock alert", async () => {
    const previousSnapshot = createSnapshot();
    const nextSnapshot = createSnapshot({
      items: [
        {
          ...baseItem,
          currentQuantity: 5,
          status: "low_stock",
        },
      ],
      alerts: [createLowStockAlert()],
    });
    gatewayMocks.loadAppSnapshot.mockResolvedValueOnce(previousSnapshot);
    gatewayMocks.issueMaterial.mockResolvedValueOnce(nextSnapshot);

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).toEqual(previousSnapshot);
    });

    let success = false;
    await act(async () => {
      success = await result.current.handleIssueMaterial({
        itemId: baseItem.id,
        quantity: 10,
        reason: "Production",
        performedBy: basePersonnel.name,
      });
    });

    expect(success).toBe(true);
    expect(result.current.snapshot).toEqual(nextSnapshot);
    expect(result.current.notice).toMatchObject({ tone: "warning" });
    expect(result.current.notice?.message).toContain(tInventory("successIssueMaterial"));
    expect(result.current.notice?.message).toContain(baseItem.name);
  });

  it("updates the snapshot and notice when backup-now succeeds", async () => {
    const initialSnapshot = createSnapshot();
    const nextSnapshot = createSnapshot({
      backupPlan: {
        ...createSnapshot().backupPlan,
        targetPath: "/tmp/openinventory-backups",
        lastSuccessfulBackup: "2026-03-31T12:00:00Z",
        status: "healthy",
      },
    });
    gatewayMocks.loadAppSnapshot.mockResolvedValueOnce(initialSnapshot);
    gatewayMocks.backupNow.mockResolvedValueOnce(nextSnapshot);

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).toEqual(initialSnapshot);
    });

    let success = false;
    await act(async () => {
      success = await result.current.handleBackupNow();
    });

    expect(success).toBe(true);
    expect(result.current.snapshot).toEqual(nextSnapshot);
    expect(result.current.notice).toEqual({
      message: tBackup("backupCompleted"),
      tone: "success",
    });
  });

  it("optimistically updates the currency and persists it on success", async () => {
    gatewayMocks.loadAppSnapshot.mockResolvedValueOnce(createSnapshot({ currency: "CNY" }));

    const { result } = renderHook(() => useInventoryState());
    await waitFor(() => {
      expect(result.current.snapshot?.currency).toBe("CNY");
    });

    await act(async () => {
      result.current.handleCurrencyChange("USD");
    });

    expect(gatewayMocks.updateAppCurrency).toHaveBeenCalledWith("USD");
    expect(result.current.snapshot?.currency).toBe("USD");
  });

  it("rolls back the optimistic currency change when persistence fails", async () => {
    gatewayMocks.loadAppSnapshot.mockResolvedValueOnce(createSnapshot({ currency: "CNY" }));
    gatewayMocks.updateAppCurrency.mockRejectedValueOnce(
      new GatewayError({ messageId: "genericActionError", debugMessage: "Updating the app currency is not supported in this runtime." }),
    );

    const { result } = renderHook(() => useInventoryState());
    await waitFor(() => {
      expect(result.current.snapshot?.currency).toBe("CNY");
    });

    await act(async () => {
      result.current.handleCurrencyChange("USD");
    });

    // The optimistic value must not stick — there is no polling loop to
    // reconcile it in an HTTP/LAN session.
    await waitFor(() => {
      expect(result.current.snapshot?.currency).toBe("CNY");
    });
  });

  it("surfaces localized backup errors when backup-now fails", async () => {
    gatewayMocks.backupNow.mockRejectedValueOnce(
      new GatewayError({ messageId: "backupTargetPathRequired", debugMessage: "Backup target path is required before running a backup." }),
    );

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).not.toBeNull();
    });

    let success = true;
    await act(async () => {
      success = await result.current.handleBackupNow();
    });

    expect(success).toBe(false);
    expect(result.current.notice).toBeNull();
    expect(result.current.actionError).toBe(tBackup("backupTargetPathRequired"));
  });

  it("stores comparison data after restore validation without restoring immediately", async () => {
    gatewayMocks.selectRestoreSource.mockResolvedValueOnce("/tmp/backup/OpenInventory-Backup");

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).not.toBeNull();
    });

    await act(async () => {
      await result.current.startRestoreFromBackup();
    });

    expect(gatewayMocks.validateBackup).toHaveBeenCalledWith("/tmp/backup/OpenInventory-Backup");
    expect(gatewayMocks.restoreFromBackup).not.toHaveBeenCalled();
    expect(result.current.pendingRestoreComparison).toMatchObject({
      backup: { appVersion: "0.0.4" },
      backupIsNewer: false,
    });
  });

  it("confirms restore only after pending comparison data exists", async () => {
    gatewayMocks.selectRestoreSource.mockResolvedValueOnce("/tmp/backup/OpenInventory-Backup");

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).not.toBeNull();
    });

    await act(async () => {
      await result.current.confirmRestoreFromBackup();
    });
    expect(gatewayMocks.restoreFromBackup).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.startRestoreFromBackup();
    });
    await act(async () => {
      await result.current.confirmRestoreFromBackup();
    });

    expect(gatewayMocks.restoreFromBackup).toHaveBeenCalledWith("/tmp/backup/OpenInventory-Backup");
    expect(result.current.pendingRestoreComparison).toBeNull();
  });

  it("keeps restore dialog closed and surfaces errors when backup validation fails", async () => {
    gatewayMocks.selectRestoreSource.mockResolvedValueOnce("/tmp/backup/OpenInventory-Backup");
    gatewayMocks.validateBackup.mockResolvedValueOnce({
      validation: { valid: false, error: "Backup is invalid" },
    });

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).not.toBeNull();
    });

    await act(async () => {
      await result.current.startRestoreFromBackup();
    });

    expect(result.current.pendingRestoreComparison).toBeNull();
    expect(result.current.actionError).toBe("Backup is invalid");
    expect(gatewayMocks.restoreFromBackup).not.toHaveBeenCalled();
  });

  it("warns instead of saving LAN settings outside the desktop runtime", async () => {
    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).not.toBeNull();
    });

    let success = true;
    await act(async () => {
      success = await result.current.handleLanAccessSave({ enabled: true, port: 4123 });
    });

    expect(success).toBe(false);
    expect(gatewayMocks.updateLanAccess).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({
      message: tCommon("lanDesktopOnly"),
      tone: "warning",
    });
  });

  it("saves LAN settings and refreshes desktop state", async () => {
    visibilityState = "hidden";
    runtimeMocks.detectRuntime.mockReturnValue("desktop");

    const refreshedSnapshot = createSnapshot({
      backupPlan: {
        ...createSnapshot().backupPlan,
        targetPath: "/tmp/backups",
      },
    });
    gatewayMocks.loadAppSnapshot
      .mockResolvedValueOnce(createSnapshot())
      .mockResolvedValueOnce(refreshedSnapshot);

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.lanAccess).toEqual(baseLanAccessState);
      expect(result.current.snapshot).not.toBeNull();
    });

    let success = false;
    await act(async () => {
      success = await result.current.handleLanAccessSave({ enabled: true, port: 4123 });
    });

    expect(success).toBe(true);
    expect(gatewayMocks.updateLanAccess).toHaveBeenCalledWith({ enabled: true, port: 4123 });
    expect(gatewayMocks.loadAppSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.lanAccess).toMatchObject({
      enabled: true,
      status: "running",
    });
    expect(result.current.snapshot).toEqual(refreshedSnapshot);
    expect(result.current.notice).toEqual({
      message: tCommon("lanAccessUpdated"),
      tone: "success",
    });
  });

  it("regenerates the LAN access key in desktop mode", async () => {
    visibilityState = "hidden";
    runtimeMocks.detectRuntime.mockReturnValue("desktop");
    gatewayMocks.loadLanAccessState.mockResolvedValueOnce({
      ...baseLanAccessState,
      enabled: true,
      status: "running",
      accessKey: "old-key",
      urls: ["http://127.0.0.1:4123"],
      statusMessage: "LAN server is running.",
    });

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.lanAccess?.accessKey).toBe("old-key");
    });

    await act(async () => {
      await result.current.handleLanAccessKeyRegenerate();
    });

    expect(gatewayMocks.regenerateLanAccessKey).toHaveBeenCalledOnce();
    expect(result.current.lanAccess?.accessKey).toBe("regenerated-key");
    expect(result.current.notice).toEqual({
      message: tCommon("lanAccessKeyRegenerated"),
      tone: "success",
    });
  });

  it("disconnects the browser session and clears loaded state", async () => {
    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).not.toBeNull();
    });

    await act(async () => {
      result.current.reportActionError("Something went wrong.");
    });

    act(() => {
      result.current.disconnectBrowser();
    });

    expect(gatewayMocks.clearLanAccessKey).toHaveBeenCalledOnce();
    expect(result.current.accessKeyInput).toBe("");
    expect(result.current.snapshot).toBeNull();
    expect(result.current.loadError).toBeNull();
    expect(result.current.actionError).toBeNull();
    expect(result.current.notice).toBeNull();
  });

  it("handles delete movement rejection with error message", async () => {
    const initialSnapshot = createSnapshot();
    gatewayMocks.loadAppSnapshot.mockResolvedValueOnce(initialSnapshot);
    
    // Mock delete movement to throw error
    const deleteError = Object.assign(
      new Error("Insufficient stock to delete this movement"),
      { messageId: "insufficientStockWhenDeletingMovement" },
    );
    gatewayMocks.deleteMovement.mockRejectedValueOnce(deleteError);

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).toEqual(initialSnapshot);
    });

    let success = true;
    await act(async () => {
      success = await result.current.handleDeleteMovement("movement-1");
    });

    expect(success).toBe(false);
    expect(result.current.snapshot).toEqual(initialSnapshot);
    expect(result.current.notice).toBeNull();
    expect(result.current.actionError).toBeDefined();
  });

  it("handles delete movement rejection with generic error", async () => {
    const initialSnapshot = createSnapshot();
    gatewayMocks.loadAppSnapshot.mockResolvedValueOnce(initialSnapshot);
    
    const deleteError = new Error("Unexpected error during delete");
    gatewayMocks.deleteMovement.mockRejectedValueOnce(deleteError);

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).toEqual(initialSnapshot);
    });

    let success = true;
    await act(async () => {
      success = await result.current.handleDeleteMovement("movement-1");
    });

    expect(success).toBe(false);
    expect(result.current.snapshot).toEqual(initialSnapshot);
    expect(result.current.notice).toBeNull();
    expect(result.current.actionError).toBe(tCommon("genericActionError"));
  });

  it("returns false when snapshot is null during delete movement", async () => {
    gatewayMocks.loadAppSnapshot.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useInventoryState());

    await waitFor(() => {
      expect(result.current.snapshot).toBeNull();
    });

    let success = true;
    await act(async () => {
      success = await result.current.handleDeleteMovement("movement-1");
    });

    expect(success).toBe(false);
    expect(gatewayMocks.deleteMovement).not.toHaveBeenCalled();
  });
});
