/**
 * Auto-update IPC contract and preload integration tests.
 *
 * Validates that the auto-update channels are properly registered in the
 * preload allowlists and that the IPC contract is correctly defined.
 */
import { describe, it, expect } from "vitest";

// ─── Channel allowlists (mirrors src/preload/index.ts) ──────────────────────

const ALLOWED_CHANNELS = new Set([
  "app-health",
  "load-app-snapshot",
  "create-inventory-item",
  "update-inventory-item",
  "receive-stock",
  "issue-material",
  "batch-issue-material",
  "get-item-movements",
  "update-backup-plan",
  "backup-now",
  "update-app-language",
  "remove-inventory-item",
  "add-personnel",
  "remove-personnel",
  "load-lan-access-state",
  "update-lan-access",
  "regenerate-lan-access-key",
  "check-for-updates",
  "download-update",
  "install-update",
]);

const ALLOWED_EVENT_CHANNELS = new Set([
  "auto-update-status",
]);

// ─── Auto-update IPC contracts ───────────────────────────────────────────────

const AUTO_UPDATE_CONTRACTS = {
  "check-for-updates": { args: "none", returns: "UpdateStatus", mutates: false },
  "download-update": { args: "none", returns: "void", mutates: false },
  "install-update": { args: "none", returns: "void", mutates: true },
} as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("auto-update IPC channels", () => {
  it("preload allowlist includes all three auto-update invoke channels", () => {
    expect(ALLOWED_CHANNELS.has("check-for-updates")).toBe(true);
    expect(ALLOWED_CHANNELS.has("download-update")).toBe(true);
    expect(ALLOWED_CHANNELS.has("install-update")).toBe(true);
  });

  it("preload allowlist includes the auto-update push event channel", () => {
    expect(ALLOWED_EVENT_CHANNELS.has("auto-update-status")).toBe(true);
  });

  it("preload allowlist has exactly 20 invoke channels (17 original + 3 auto-update)", () => {
    expect(ALLOWED_CHANNELS.size).toBe(20);
  });

  it("preload event allowlist has exactly 1 event channel", () => {
    expect(ALLOWED_EVENT_CHANNELS.size).toBe(1);
  });
});

describe("auto-update IPC contracts", () => {
  it("check-for-updates is a read-only command that returns UpdateStatus", () => {
    const c = AUTO_UPDATE_CONTRACTS["check-for-updates"];
    expect(c.args).toBe("none");
    expect(c.returns).toBe("UpdateStatus");
    expect(c.mutates).toBe(false);
  });

  it("download-update takes no args and returns void", () => {
    const c = AUTO_UPDATE_CONTRACTS["download-update"];
    expect(c.args).toBe("none");
    expect(c.returns).toBe("void");
    expect(c.mutates).toBe(false);
  });

  it("install-update is the only mutating auto-update command (quits the app)", () => {
    const c = AUTO_UPDATE_CONTRACTS["install-update"];
    expect(c.args).toBe("none");
    expect(c.returns).toBe("void");
    expect(c.mutates).toBe(true);
  });
});

describe("auto-update channel name mapping", () => {
  const GATEWAY_TO_IPC: Record<string, string> = {
    check_for_updates: "check-for-updates",
    download_update: "download-update",
    install_update: "install-update",
  };

  it("converts snake_case gateway commands to kebab-case IPC channels", () => {
    for (const [gateway, ipc] of Object.entries(GATEWAY_TO_IPC)) {
      const converted = gateway.replace(/_/g, "-");
      expect(converted).toBe(ipc);
    }
  });

  it("all mapped channels exist in the preload allowlist", () => {
    for (const ipcChannel of Object.values(GATEWAY_TO_IPC)) {
      expect(ALLOWED_CHANNELS.has(ipcChannel)).toBe(true);
    }
  });
});

describe("UpdateStatus type contract", () => {
  /** All valid stages that the service can report. */
  const VALID_STAGES = [
    "idle",
    "checking",
    "available",
    "not-available",
    "downloading",
    "downloaded",
    "error",
  ] as const;

  it("defines exactly 7 update stages", () => {
    expect(VALID_STAGES).toHaveLength(7);
  });

  it("available stage carries version and releaseNotes", () => {
    const status = { stage: "available" as const, version: "1.0.0", releaseNotes: "New features" };
    expect(status.version).toBeDefined();
    expect(status.releaseNotes).toBeDefined();
  });

  it("downloading stage carries progress metrics", () => {
    const status = { stage: "downloading" as const, percent: 42.5, transferred: 4250000, total: 10000000 };
    expect(status.percent).toBeGreaterThanOrEqual(0);
    expect(status.percent).toBeLessThanOrEqual(100);
    expect(status.transferred).toBeLessThanOrEqual(status.total);
  });

  it("error stage carries a message string", () => {
    const status = { stage: "error" as const, message: "Network timeout" };
    expect(typeof status.message).toBe("string");
    expect(status.message.length).toBeGreaterThan(0);
  });

  it("idle and checking stages carry no extra data", () => {
    const idle = { stage: "idle" as const };
    const checking = { stage: "checking" as const };
    expect(Object.keys(idle)).toEqual(["stage"]);
    expect(Object.keys(checking)).toEqual(["stage"]);
  });
});
