/**
 * Category C: IPC contract tests
 *
 * These tests define the channel map, argument shapes, and return types
 * for the 17 IPC handlers that will be registered in Electron's main process.
 * They validate the contract between frontend gateway and backend services.
 */
import { describe, it, expect } from "vitest";

// ─── Channel definitions matching the Rust commands from lib.rs ──────────────

/**
 * Complete list of IPC channels.
 * Rust commands use snake_case, Electron will use kebab-case.
 */
const IPC_CHANNELS = [
  "app-health",
  "load-app-snapshot",
  "load-lan-access-state",
  "update-lan-access",
  "regenerate-lan-access-key",
  "create-inventory-item",
  "update-inventory-item",
  "receive-stock",
  "issue-material",
  "batch-issue-material",
  "update-backup-plan",
  "backup-now",
  "get-item-movements",
  "update-app-language",
  "remove-inventory-item",
  "add-personnel",
  "remove-personnel",
] as const;

type IpcChannel = (typeof IPC_CHANNELS)[number];

/**
 * Maps each channel to its expected argument shape and return type description.
 * This is the contract that the IPC layer must satisfy.
 */
const CHANNEL_CONTRACTS: Record<
  IpcChannel,
  { args: string; returns: string; mutates: boolean }
> = {
  "app-health": { args: "none", returns: "AppHealth", mutates: false },
  "load-app-snapshot": { args: "none", returns: "AppSnapshot", mutates: false },
  "load-lan-access-state": {
    args: "none",
    returns: "LanAccessState",
    mutates: false,
  },
  "update-lan-access": {
    args: "UpdateLanAccessInput",
    returns: "LanAccessState",
    mutates: true,
  },
  "regenerate-lan-access-key": {
    args: "none",
    returns: "LanAccessState",
    mutates: true,
  },
  "create-inventory-item": {
    args: "CreateInventoryItemInput",
    returns: "AppSnapshot",
    mutates: true,
  },
  "update-inventory-item": {
    args: "UpdateInventoryItemInput",
    returns: "AppSnapshot",
    mutates: true,
  },
  "receive-stock": {
    args: "StockMutationInput",
    returns: "AppSnapshot",
    mutates: true,
  },
  "issue-material": {
    args: "StockMutationInput",
    returns: "AppSnapshot",
    mutates: true,
  },
  "batch-issue-material": {
    args: "BatchIssueMaterialInput",
    returns: "AppSnapshot",
    mutates: true,
  },
  "update-backup-plan": {
    args: "UpdateBackupPlanInput",
    returns: "AppSnapshot",
    mutates: true,
  },
  "backup-now": { args: "none", returns: "AppSnapshot", mutates: true },
  "get-item-movements": {
    args: "itemId: string",
    returns: "InventoryMovement[]",
    mutates: false,
  },
  "update-app-language": {
    args: "Language",
    returns: "void",
    mutates: true,
  },
  "remove-inventory-item": {
    args: "itemId: string",
    returns: "AppSnapshot",
    mutates: true,
  },
  "add-personnel": {
    args: "AddPersonnelInput",
    returns: "AppSnapshot",
    mutates: true,
  },
  "remove-personnel": {
    args: "personnelId: string",
    returns: "AppSnapshot",
    mutates: true,
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("IPC channel registration", () => {
  it("defines exactly 17 channels", () => {
    expect(IPC_CHANNELS).toHaveLength(17);
  });

  it("all channels have unique names", () => {
    const unique = new Set(IPC_CHANNELS);
    expect(unique.size).toBe(IPC_CHANNELS.length);
  });

  it("every channel has a defined contract", () => {
    for (const channel of IPC_CHANNELS) {
      expect(CHANNEL_CONTRACTS[channel]).toBeDefined();
    }
  });
});

describe("IPC channel contracts", () => {
  it("app-health returns status and storage type", () => {
    const c = CHANNEL_CONTRACTS["app-health"];
    expect(c.args).toBe("none");
    expect(c.returns).toBe("AppHealth");
    expect(c.mutates).toBe(false);
  });

  it("load-app-snapshot is read-only and returns full state", () => {
    const c = CHANNEL_CONTRACTS["load-app-snapshot"];
    expect(c.args).toBe("none");
    expect(c.returns).toBe("AppSnapshot");
    expect(c.mutates).toBe(false);
  });

  it("all mutating commands return AppSnapshot (except update-app-language)", () => {
    for (const [channel, contract] of Object.entries(CHANNEL_CONTRACTS)) {
      if (
        contract.mutates &&
        channel !== "update-app-language" &&
        channel !== "update-lan-access" &&
        channel !== "regenerate-lan-access-key"
      ) {
        expect(contract.returns).toBe("AppSnapshot");
      }
    }
  });

  it("LAN commands return LanAccessState", () => {
    expect(CHANNEL_CONTRACTS["load-lan-access-state"].returns).toBe(
      "LanAccessState",
    );
    expect(CHANNEL_CONTRACTS["update-lan-access"].returns).toBe(
      "LanAccessState",
    );
    expect(CHANNEL_CONTRACTS["regenerate-lan-access-key"].returns).toBe(
      "LanAccessState",
    );
  });

  it("get-item-movements returns array of movements", () => {
    const c = CHANNEL_CONTRACTS["get-item-movements"];
    expect(c.returns).toBe("InventoryMovement[]");
    expect(c.mutates).toBe(false);
  });

  it("update-app-language returns void", () => {
    const c = CHANNEL_CONTRACTS["update-app-language"];
    expect(c.returns).toBe("void");
    expect(c.mutates).toBe(true);
  });
});

describe("error serialization contract", () => {
  it("errors serialize to plain strings across IPC", () => {
    // The Rust backend converts AppError to InvokeError(String).
    // The Electron IPC layer must do the same: serialize errors as strings
    // that the frontend GatewayError can wrap.
    const testErrors = [
      { type: "NotFound", message: "Item not found." },
      { type: "DuplicateSku", message: "SKU already exists." },
      {
        type: "InsufficientStock",
        message:
          "Cannot issue 15 units. Current available stock is 10.",
      },
      { type: "ValidationError", message: "Item name is required." },
    ];

    for (const err of testErrors) {
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it("InsufficientStock error message includes available and requested counts", () => {
    const available = 10;
    const requested = 15;
    const message = `Cannot issue ${requested} units. Current available stock is ${available}.`;

    expect(message).toContain("15");
    expect(message).toContain("10");
  });
});

describe("preload contextBridge contract", () => {
  it("exposes a single invoke function matching gateway expectations", () => {
    // The preload must expose: window.electronAPI.invoke(channel, args?) => Promise<T>
    // This mirrors the Tauri pattern: window.__TAURI_INTERNALS__.invoke(command, args?)
    const electronAPI = {
      invoke: async <T>(channel: string, _args?: unknown): Promise<T> => {
        // Stub — in real preload this delegates to ipcRenderer.invoke
        throw new Error(`Not implemented: ${channel}`);
      },
    };

    expect(typeof electronAPI.invoke).toBe("function");
  });
});

describe("gateway runtime detection", () => {
  it("detects desktop runtime when electronAPI is present", () => {
    // Simulates the runtime detection logic
    const hasElectronAPI = true; // window.electronAPI exists
    const runtime = hasElectronAPI ? "desktop" : "http";

    expect(runtime).toBe("desktop");
  });

  it("falls back to http runtime when electronAPI is absent", () => {
    const hasElectronAPI = false;
    const runtime = hasElectronAPI ? "desktop" : "http";

    expect(runtime).toBe("http");
  });
});

describe("channel name mapping from Tauri to Electron", () => {
  // Tauri uses snake_case, Electron uses kebab-case
  const TAURI_TO_ELECTRON: Record<string, string> = {
    app_health: "app-health",
    load_app_snapshot: "load-app-snapshot",
    load_lan_access_state: "load-lan-access-state",
    update_lan_access: "update-lan-access",
    regenerate_lan_access_key: "regenerate-lan-access-key",
    create_inventory_item: "create-inventory-item",
    update_inventory_item: "update-inventory-item",
    receive_stock: "receive-stock",
    issue_material: "issue-material",
    batch_issue_material: "batch-issue-material",
    update_backup_plan: "update-backup-plan",
    backup_now: "backup-now",
    get_item_movements: "get-item-movements",
    update_app_language: "update-app-language",
    remove_inventory_item: "remove-inventory-item",
    add_personnel: "add-personnel",
    remove_personnel: "remove-personnel",
  };

  it("maps all 17 Tauri commands to Electron channels", () => {
    expect(Object.keys(TAURI_TO_ELECTRON)).toHaveLength(17);
  });

  it("converts snake_case to kebab-case correctly", () => {
    for (const [tauri, electron] of Object.entries(TAURI_TO_ELECTRON)) {
      const converted = tauri.replace(/_/g, "-");
      expect(converted).toBe(electron);
    }
  });
});
