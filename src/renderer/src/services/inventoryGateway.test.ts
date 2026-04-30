import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AppSnapshot,
  AuditAnalyticsResult,
  AuditMovementFilters,
  AuditPageResult,
  InventoryMovement,
  LanAccessState,
  QrLabelExportPayload,
} from "../domain/models";
import {
  GatewayError,
  addPersonnel,
  backupNow,
  batchIssueMaterial,
  clearLanAccessKey,
  createInventoryItem,
  exportQrLabel,
  exportSelectedQrLabels,
  getAuditAnalytics,
  getAuditMovements,
  getItemMovements,
  issueMaterial,
  loadAppSnapshot,
  loadLanAccessState,
  persistLanAccessKey,
  readPersistedLanAccessKey,
  readPersistedLanguage,
  receiveStock,
  regenerateLanAccessKey,
  removeInventoryItem,
  removePersonnel,
  restoreFromBackup,
  selectBackupDirectory,
  selectRestoreSource,
  updateAppLanguage,
  updateBackupPlan,
  updateInventoryItem,
  updateLanAccess,
  validateBackup,
} from "./inventoryGateway";

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
    status: "healthy",
    cloudProvider: "",
  },
  language: "en",
};
const lanAccessState: LanAccessState = {
  enabled: true,
  port: 4123,
  accessKey: "lan-key-123",
  urls: ["http://127.0.0.1:4123"],
  status: "running",
  statusMessage: "LAN server is running.",
};
const movements: InventoryMovement[] = [
  {
    id: "mov-1",
    itemId: "item-1",
    movementType: "issue",
    quantity: 5,
    performedBy: "Alice",
    reason: "Production",
    createdAt: "2026-04-03T08:00:00Z",
  },
];
const auditFilters: AuditMovementFilters = {
  page: 2,
  pageSize: 25,
  movementType: "issue",
  itemSearch: "bolt",
  sortBy: "performedAt",
  sortDir: "desc",
};
const auditPage: AuditPageResult = {
  rows: [],
  total: 0,
  summary: {
    totalMovements: 0,
    totalReceived: 0,
    totalIssued: 0,
    uniqueItems: 0,
    uniquePersonnel: 0,
  },
};
const auditAnalytics: AuditAnalyticsResult = {
  summary: auditPage.summary,
  personnelActivity: [],
  itemActivity: [],
  anomalyMovements: [],
};
const backupValidation = {
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
};
const storage: Record<string, string> = {};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
    clear: () => {
      for (const key of Object.keys(storage)) {
        delete storage[key];
      }
    },
  },
});

function setDesktopApi(
  implementation: (channel: string, args?: unknown) => unknown | Promise<unknown>,
) {
  const invoke = vi.fn(implementation);
  window.electronAPI = { invoke, on: vi.fn() };
  return invoke;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (typeof window !== "undefined") {
    window.electronAPI = undefined;
    window.localStorage.clear();
  }
});

describe("local persistence helpers", () => {
  it("defaults language to English when nothing is stored", () => {
    expect(readPersistedLanguage()).toBe("en");
  });

  it("ignores invalid stored language values", () => {
    window.localStorage.setItem("inventory-monitor.language", "fr");

    expect(readPersistedLanguage()).toBe("en");
  });

  it("stores and clears the LAN access key in local storage", () => {
    persistLanAccessKey("secret-key");
    expect(readPersistedLanAccessKey()).toBe("secret-key");

    clearLanAccessKey();
    expect(readPersistedLanAccessKey()).toBe("");
  });
});

describe("loadAppSnapshot", () => {
  it("uses the desktop invoke bridge when the Electron runtime is available", async () => {
    const invoke = vi.fn(async () => snapshot);
    window.electronAPI = { invoke };

    await expect(loadAppSnapshot()).resolves.toEqual(snapshot);
    expect(invoke).toHaveBeenCalledWith("load-app-snapshot", undefined);
    expect(window.localStorage.getItem("inventory-monitor.language")).toBe("en");
  });

  it("uses the HTTP API in browser-hosted mode", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/snapshot",
      expect.objectContaining({ method: "GET" }),
    );
    expect(window.localStorage.getItem("inventory-monitor.language")).toBe("en");
  });

  it("throws an unsupported runtime error when neither desktop nor HTTP APIs are available", async () => {
    vi.stubGlobal("window", undefined);

    await expect(loadAppSnapshot()).rejects.toThrowError(
      "Loading the inventory workspace requires the desktop app or LAN HTTP access.",
    );
  });

  it("extracts an API error message from the response body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "Snapshot unavailable." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).rejects.toEqual(new GatewayError("Snapshot unavailable.", 503));
  });

  it("falls back to a generic message when the error response cannot be parsed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not-json", {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).rejects.toMatchObject({
      message: "Request failed with status 500.",
      name: "GatewayError",
      status: 500,
    });
  });

  it("falls back to a generic message when the API omits a message field", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "missing message" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAppSnapshot()).rejects.toMatchObject({
      message: "Request failed with status 404.",
      name: "GatewayError",
      status: 404,
    });
  });
});

describe("desktop command routing", () => {
  it("routes desktop-only LAN and backup restore commands through IPC", async () => {
    const invoke = setDesktopApi((channel) => {
      switch (channel) {
        case "load-lan-access-state":
        case "update-lan-access":
        case "regenerate-lan-access-key":
          return lanAccessState;
        case "select-backup-directory":
          return "/tmp/backups";
        case "select-restore-source":
          return "/tmp/restore-source";
        case "validate-backup":
          return backupValidation;
        case "restore-from-backup":
          return undefined;
        default:
          throw new Error(`Unexpected channel ${channel}`);
      }
    });

    await expect(loadLanAccessState()).resolves.toEqual(lanAccessState);
    await expect(updateLanAccess({ enabled: true, port: 4123 })).resolves.toEqual(lanAccessState);
    await expect(regenerateLanAccessKey()).resolves.toEqual(lanAccessState);
    await expect(selectBackupDirectory()).resolves.toBe("/tmp/backups");
    await expect(selectRestoreSource()).resolves.toBe("/tmp/restore-source");
    await expect(validateBackup("/tmp/restore-source")).resolves.toEqual(backupValidation);
    await expect(restoreFromBackup("/tmp/restore-source")).resolves.toBeUndefined();

    expect(invoke).toHaveBeenNthCalledWith(1, "load-lan-access-state", undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, "update-lan-access", {
      input: { enabled: true, port: 4123 },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "regenerate-lan-access-key", undefined);
    expect(invoke).toHaveBeenNthCalledWith(4, "select-backup-directory", undefined);
    expect(invoke).toHaveBeenNthCalledWith(5, "select-restore-source", undefined);
    expect(invoke).toHaveBeenNthCalledWith(6, "validate-backup", { dirPath: "/tmp/restore-source" });
    expect(invoke).toHaveBeenNthCalledWith(7, "restore-from-backup", { dirPath: "/tmp/restore-source" });
  });

  it("routes desktop inventory, personnel, audit, and backup commands through IPC", async () => {
    const invoke = setDesktopApi((channel) => {
      switch (channel) {
        case "create-inventory-item":
        case "update-inventory-item":
        case "receive-stock":
        case "issue-material":
        case "batch-issue-material":
        case "update-backup-plan":
        case "backup-now":
        case "remove-inventory-item":
        case "add-personnel":
        case "remove-personnel":
          return snapshot;
        case "get-item-movements":
          return movements;
        case "get-audit-movements":
          return auditPage;
        case "get-audit-analytics":
          return auditAnalytics;
        case "update-app-language":
          return undefined;
        default:
          throw new Error(`Unexpected channel ${channel}`);
      }
    });

    await expect(createInventoryItem({
      sku: "SKU-NEW",
      name: "New Item",
      category: "Parts",
      location: "Shelf A",
      unit: "pcs",
      supplier: "Acme",
      reorderQuantity: 5,
      initialQuantity: 10,
    })).resolves.toEqual(snapshot);
    await expect(updateInventoryItem({
      itemId: "item-1",
      sku: "SKU-NEW",
      name: "Updated Item",
      category: "Parts",
      location: "Shelf B",
      unit: "pcs",
      supplier: "Acme",
      reorderQuantity: 7,
    })).resolves.toEqual(snapshot);
    await expect(receiveStock({
      itemId: "item-1",
      quantity: 5,
      performedBy: "Alice",
      reason: "Restock",
    })).resolves.toEqual(snapshot);
    await expect(issueMaterial({
      itemId: "item-1",
      quantity: 2,
      performedBy: "Alice",
      reason: "Production",
    })).resolves.toEqual(snapshot);
    await expect(batchIssueMaterial({
      items: [{ itemId: "item-1", quantity: 2 }],
      performedBy: "Alice",
      reason: "Batch issue",
    })).resolves.toEqual(snapshot);
    await expect(updateBackupPlan({
      targetPath: "/tmp/backups",
      intervalValue: 4,
      intervalUnit: "hours",
      onStartup: true,
    })).resolves.toEqual(snapshot);
    await expect(backupNow()).resolves.toEqual(snapshot);
    await expect(removeInventoryItem("item-1")).resolves.toEqual(snapshot);
    await expect(getItemMovements("item-1")).resolves.toEqual(movements);
    await expect(addPersonnel({ name: "Bob" })).resolves.toEqual(snapshot);
    await expect(removePersonnel("person-1")).resolves.toEqual(snapshot);
    await expect(updateAppLanguage("zh-CN")).resolves.toBeUndefined();
    await expect(getAuditMovements(auditFilters)).resolves.toEqual(auditPage);
    await expect(getAuditAnalytics({
      movementType: "issue",
      itemSearch: "bolt",
    })).resolves.toEqual(auditAnalytics);

    expect(invoke).toHaveBeenCalledWith("create-inventory-item", expect.any(Object));
    expect(invoke).toHaveBeenCalledWith("update-inventory-item", expect.any(Object));
    expect(invoke).toHaveBeenCalledWith("receive-stock", expect.any(Object));
    expect(invoke).toHaveBeenCalledWith("issue-material", expect.any(Object));
    expect(invoke).toHaveBeenCalledWith("batch-issue-material", expect.any(Object));
    expect(invoke).toHaveBeenCalledWith("update-backup-plan", expect.any(Object));
    expect(invoke).toHaveBeenCalledWith("backup-now", undefined);
    expect(invoke).toHaveBeenCalledWith("remove-inventory-item", { itemId: "item-1" });
    expect(invoke).toHaveBeenCalledWith("get-item-movements", { itemId: "item-1" });
    expect(invoke).toHaveBeenCalledWith("add-personnel", { input: { name: "Bob" } });
    expect(invoke).toHaveBeenCalledWith("remove-personnel", { personnelId: "person-1" });
    expect(invoke).toHaveBeenCalledWith("update-app-language", { language: "zh-CN" });
    expect(invoke).toHaveBeenCalledWith("get-audit-movements", { filters: auditFilters });
    expect(invoke).toHaveBeenCalledWith("get-audit-analytics", {
      filters: { movementType: "issue", itemSearch: "bolt" },
    });
    expect(window.localStorage.getItem("inventory-monitor.language")).toBe("zh-CN");
  });

  it("rejects LAN access management outside the desktop runtime", async () => {
    await expect(loadLanAccessState()).rejects.toMatchObject({
      message: "LAN access can only be managed from the desktop app.",
      messageId: "lanDesktopOnly",
    });
    await expect(updateLanAccess({ enabled: true, port: 4123 })).rejects.toMatchObject({
      message: "LAN access can only be managed from the desktop app.",
      messageId: "lanDesktopOnly",
    });
    await expect(regenerateLanAccessKey()).rejects.toMatchObject({
      message: "LAN access can only be managed from the desktop app.",
      messageId: "lanDesktopOnly",
    });
  });
});

describe("HTTP API routing", () => {
  it("routes browser-hosted mutations through fetch and forwards the persisted access key", async () => {
    persistLanAccessKey("persisted-key");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/audit/movements?")) {
        return new Response(JSON.stringify(auditPage), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/audit/analytics?")) {
        return new Response(JSON.stringify(auditAnalytics), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/language") {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createInventoryItem({
      sku: "SKU-HTTP",
      name: "HTTP Item",
      category: "Parts",
      location: "Shelf A",
      unit: "pcs",
      supplier: "Acme",
      reorderQuantity: 5,
      initialQuantity: 1,
    });
    await updateInventoryItem({
      itemId: "item-1",
      sku: "SKU-HTTP",
      name: "HTTP Item Updated",
      category: "Parts",
      location: "Shelf B",
      unit: "pcs",
      supplier: "Acme",
      reorderQuantity: 6,
    });
    await receiveStock({
      itemId: "item-1",
      quantity: 3,
      performedBy: "Alice",
      reason: "Restock",
    });
    await issueMaterial({
      itemId: "item-1",
      quantity: 1,
      performedBy: "Alice",
      reason: "Use",
    });
    await batchIssueMaterial({
      items: [{ itemId: "item-1", quantity: 1 }],
      performedBy: "Alice",
      reason: "Batch",
    });
    await updateBackupPlan({
      targetPath: "/tmp/http-backups",
      intervalValue: 12,
      intervalUnit: "hours",
      onStartup: false,
    });
    await backupNow();
    await removeInventoryItem("item-1");
    await addPersonnel({ name: "Bob" });
    await removePersonnel("person-1");
    await updateAppLanguage("zh-CN");
    await getAuditMovements(auditFilters);
    await getAuditAnalytics({ itemSearch: "bolt", movementType: "issue" });

    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-inventory-key")).toBe("persisted-key");
    }
    expect(fetchMock).toHaveBeenCalledWith("/api/items", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1/receive", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1/issue", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/items/batch-issue", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/backup-plan", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/backup-now", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1", expect.objectContaining({ method: "DELETE" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/personnel", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/personnel/person-1", expect.objectContaining({ method: "DELETE" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/language", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/audit/movements?"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/audit/analytics?"))).toBe(true);
    expect(window.localStorage.getItem("inventory-monitor.language")).toBe("zh-CN");
  });

  it("returns null for desktop-only selection dialogs outside the desktop runtime", async () => {
    await expect(selectBackupDirectory()).resolves.toBeNull();
    await expect(selectRestoreSource()).resolves.toBeNull();
  });
});

describe("QR label export gateway", () => {
  const label: QrLabelExportPayload = {
    suggestedFileName: "SKU-BOLTS-M6 - Bolts M6.png",
    pngDataUrl: "data:image/png;base64,abc123",
  };

  it("uses the desktop invoke bridge for single label export", async () => {
    const invoke = vi.fn(async () => "/tmp/SKU-BOLTS-M6 - Bolts M6.png");
    window.electronAPI = { invoke };

    await expect(exportQrLabel(label)).resolves.toBe("/tmp/SKU-BOLTS-M6 - Bolts M6.png");
    expect(invoke).toHaveBeenCalledWith("export-qr-label", { label });
  });

  it("uses the desktop invoke bridge for batch label export", async () => {
    const invoke = vi.fn(async () => ["/tmp/SKU-BOLTS-M6 - Bolts M6.png"]);
    window.electronAPI = { invoke };

    await expect(exportSelectedQrLabels([label])).resolves.toEqual([
      "/tmp/SKU-BOLTS-M6 - Bolts M6.png",
    ]);
    expect(invoke).toHaveBeenCalledWith("export-qr-labels", { labels: [label] });
  });

  it("rejects QR export when the desktop runtime is unavailable", async () => {
    await expect(exportQrLabel(label)).rejects.toThrow(
      "Exporting QR labels requires the desktop app or LAN HTTP access.",
    );
    await expect(exportSelectedQrLabels([label])).rejects.toThrow(
      "Exporting QR labels requires the desktop app or LAN HTTP access.",
    );
  });
});
