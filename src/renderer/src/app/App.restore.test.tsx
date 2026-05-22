import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n";

const useInventoryStateMock = vi.hoisted(() => vi.fn());

vi.mock("./useInventoryState", () => ({
  useInventoryState: useInventoryStateMock,
}));

vi.mock("../services/inventoryGateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/inventoryGateway")>();
  return {
    ...actual,
    getAuditAnalytics: vi.fn().mockResolvedValue({ summary: { totalMovements: 0, totalReceived: 0, totalIssued: 0, uniqueItems: 0, uniquePersonnel: 0 }, byPersonnel: [], byItem: [], alertFrequency: [] }),
  };
});

vi.mock("./useAutoUpdate", () => ({
  useAutoUpdate: () => ({
    updateStatus: { stage: "idle" as const },
    appVersion: "0.0.0-test",
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
    chipDismissed: false,
    dismissChip: vi.fn(),
  }),
}));

import { App } from "./App";

const store: Record<string, string> = {};

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  },
  writable: true,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

function makeSnapshot() {
  return {
    items: [
      {
        id: "item-1",
        sku: "SKU-001",
        qrCodeDataUrl: "",
        name: "Bolts",
        category: "Parts",
        location: "Rack A",
        unit: "pcs",
        supplier: "",
        currentQuantity: 10,
        reorderQuantity: 5,
        status: "in_stock" as const,
        lastUpdated: "2026-03-31T10:00:00Z",
      },
    ],
    alerts: [],
    personnel: [],
    backupPlan: {
      targetPath: "/tmp/backups",
      schedule: { intervalValue: 0, intervalUnit: "hours" as const, onStartup: false },
      lastSuccessfulBackup: "",
      lastFileSize: 0,
      lastVerified: false,
      lastError: "",
      status: "healthy" as const,
      cloudProvider: "",
    },
    language: "en" as const,
  };
}

function makeState(overrides: Partial<ReturnType<typeof useInventoryStateMock>> = {}) {
  return {
    runtime: "desktop" as const,
    language: "en" as const,
    snapshot: makeSnapshot(),
    lanAccess: null,
    loadError: null,
    actionError: null,
    notice: null,
    busy: false,
    pendingRestoreComparison: null,
    accessKeyInput: "",
    setAccessKeyInput: vi.fn(),
    requiresBrowserAuth: false,
    connectBrowser: vi.fn(),
    disconnectBrowser: vi.fn(),
    clearFeedback: vi.fn(),
    reportActionError: vi.fn(),
    reportNotice: vi.fn(),
    handleCreateItem: vi.fn(),
    handleUpdateItem: vi.fn(),
    handleReceiveStock: vi.fn(),
    handleIssueMaterial: vi.fn(),
    handleBatchIssueMaterial: vi.fn(),
    handleRemoveItem: vi.fn(),
    handleBackupPlanSave: vi.fn(),
    handleBackupNow: vi.fn(),
    handleSelectBackupDirectory: vi.fn(),
    startRestoreFromBackup: vi.fn(),
    confirmRestoreFromBackup: vi.fn(),
    cancelRestoreFromBackup: vi.fn(),
    handleAddPersonnel: vi.fn(),
    handleRemovePersonnel: vi.fn(),
    handleLanguageChange: vi.fn(),
    handleLanAccessSave: vi.fn(),
    handleLanAccessKeyRegenerate: vi.fn(),
    ...overrides,
  };
}

describe("App restore flow", () => {
  beforeEach(() => {
    useInventoryStateMock.mockReturnValue(makeState());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts restore from the settings panel", async () => {
    const startRestoreFromBackup = vi.fn();
    useInventoryStateMock.mockReturnValue(makeState({ startRestoreFromBackup }));

    render(<App />);
    fireEvent.click(screen.getByTestId("nav-settings"));
    // Settings defaults to Personnel sub-tab; switch to Backup
    fireEvent.click(screen.getByRole("tab", { name: /backup/i }));
    fireEvent.click(screen.getByTestId("backup-restore"));

    expect(startRestoreFromBackup).toHaveBeenCalledOnce();
  });

  it("cancels and confirms restore using the dialog controls", () => {
    const cancelRestoreFromBackup = vi.fn();
    const confirmRestoreFromBackup = vi.fn();

    useInventoryStateMock.mockReturnValue(
      makeState({
        pendingRestoreComparison: {
          backup: {
            createdAt: "2026-03-31T09:00:00Z",
            items: 2,
            movements: 3,
            personnel: 1,
            schemaVersion: 4,
            appVersion: "0.0.4",
          },
          current: {
            lastActivity: "2026-03-31T10:00:00Z",
            items: 1,
            movements: 5,
            personnel: 0,
          },
          backupIsNewer: false,
        },
        cancelRestoreFromBackup,
        confirmRestoreFromBackup,
      }),
    );

    render(<App />);

    expect(screen.getByTestId("restore-dialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("restore-dialog-cancel"));
    expect(cancelRestoreFromBackup).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("restore-dialog-confirm"));
    expect(confirmRestoreFromBackup).toHaveBeenCalledOnce();
  });
});
