import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import fs from "fs";
import os from "os";
import path from "path";
import {
  DatabaseService,
  makeDatabaseLayer,
  type DatabaseServiceApi,
  type LanAccessSettings,
} from "../../src/main/services/DatabaseService";
import { BackupService, BackupServiceLive } from "../../src/main/services/BackupService";
import { LanServerService, type LanServerServiceApi } from "../../src/main/services/LanServerService";
import type { AppSnapshot } from "../../shared/types";
import {
  createTestDb,
  seedItem,
  seedPersonnel,
  seedMovement,
  writeSetting,
  type TestDb,
} from "../setup/test-db";

// ─── Mock Electron ─────────────────────────────────────────────────────────

const electronMocks = vi.hoisted(() => ({
  relaunch: vi.fn(),
  exit: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    relaunch: electronMocks.relaunch,
    exit: electronMocks.exit,
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeMockLan(): LanServerServiceApi {
  return {
    loadState: vi.fn(() =>
      Effect.succeed({
        enabled: false,
        port: 47123,
        accessKey: "key",
        urls: [],
        status: "stopped" as const,
        statusMessage: "",
      }),
    ),
    updateAccess: vi.fn(),
    regenerateAccessKey: vi.fn(),
    shutdown: vi.fn(() => Effect.void),
  } as unknown as LanServerServiceApi;
}

/** Build a ManagedRuntime backed by a real DB + BackupServiceLive + a mock LAN service. */
function makeTestRuntime(dbPath: string) {
  const DbLayer = makeDatabaseLayer(dbPath);
  const LanLayer = Layer.succeed(LanServerService, makeMockLan());
  const AppLayer = Layer.merge(Layer.merge(DbLayer, BackupServiceLive), LanLayer);
  return ManagedRuntime.make(AppLayer);
}

// ─── Test state ────────────────────────────────────────────────────────────

let t: TestDb;
const tempDirs: string[] = [];

beforeEach(() => {
  t = createTestDb();
  electronMocks.relaunch.mockClear();
  electronMocks.exit.mockClear();
});

afterEach(async () => {
  await t.cleanup();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("BackupCoordinator", () => {
  // Lazy import so the vi.mock("electron") takes effect before the module loads.
  async function loadCoordinator() {
    const mod = await import("../../src/main/services/BackupCoordinator");
    return mod.BackupCoordinator;
  }

  // ── backupNow() deduplication ──────────────────────────────────────────

  describe("backupNow() deduplication", () => {
    it("returns the same promise when called concurrently", async () => {
      // Seed data so the backup target has content
      seedItem(t.db, { name: "Dedup Item", sku: "SKU-DEDUP" });

      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-dedup-"));
      tempDirs.push(backupDir);
      writeSetting(t.db, "backup.target_path", backupDir);

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      try {
        // Fire two concurrent calls — they must return the exact same promise object
        const promise1 = coordinator.backupNow();
        const promise2 = coordinator.backupNow();

        // Verify they resolve to the same snapshot
        const [result1, result2] = await Promise.all([promise1, promise2]);
        expect(result1).toBe(result2); // Same reference
        expect(result1.items.length).toBeGreaterThanOrEqual(1);
      } finally {
        await runtime.dispose();
      }
    });

    it("allows a new backup after the first completes", async () => {
      seedItem(t.db, { name: "Sequential Item", sku: "SKU-SEQ" });

      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-seq-"));
      tempDirs.push(backupDir);
      writeSetting(t.db, "backup.target_path", backupDir);

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      try {
        const result1 = await coordinator.backupNow();
        const result2 = await coordinator.backupNow();

        // Both succeed, but they are separate calls (not deduplicated)
        expect(result1.items.length).toBeGreaterThanOrEqual(1);
        expect(result2.items.length).toBeGreaterThanOrEqual(1);
      } finally {
        await runtime.dispose();
      }
    });
  });

  // ── validateBackup() ──────────────────────────────────────────────────

  describe("validateBackup()", () => {
    it("returns comparison data with real movement counts", async () => {
      // Seed current database with items, personnel, and movements
      const itemId = seedItem(t.db, { name: "Valve", sku: "SKU-VALVE", currentQuantity: 50 });
      seedItem(t.db, { name: "Bolt", sku: "SKU-BOLT", currentQuantity: 200 });
      seedPersonnel(t.db, "Alice");
      seedPersonnel(t.db, "Bob");
      seedMovement(t.db, itemId, { type: "receive", quantity: 20 });
      seedMovement(t.db, itemId, { type: "issue", quantity: 5 });
      seedMovement(t.db, itemId, { type: "receive", quantity: 10 });

      // Create a backup directory with a real backup
      const backupTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-validate-"));
      tempDirs.push(backupTargetDir);
      writeSetting(t.db, "backup.target_path", backupTargetDir);

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      try {
        // Run a backup to create the backup directory
        await coordinator.backupNow();

        const backupDir = path.join(backupTargetDir, "OpenInventory-Backup");
        const result = await coordinator.validateBackup(backupDir);

        // Validation should pass
        expect(result.validation.valid).toBe(true);
        expect(result.validation.manifest).toBeDefined();

        // Comparison should have real counts (not hardcoded 0)
        expect(result.comparison).toBeDefined();
        expect(result.comparison!.current.items).toBe(2);
        expect(result.comparison!.current.personnel).toBe(2);
        expect(result.comparison!.current.movements).toBe(3); // 3 seeded movements

        // Backup stats should also reflect the data
        expect(result.comparison!.backup.items).toBe(2);
        expect(result.comparison!.backup.personnel).toBe(2);
        expect(result.comparison!.backup.movements).toBe(3);
      } finally {
        await runtime.dispose();
      }
    });

    it("returns validation failure for invalid backup directory", async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-empty-"));
      tempDirs.push(emptyDir);

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      try {
        const result = await coordinator.validateBackup(emptyDir);
        expect(result.validation.valid).toBe(false);
        expect(result.comparison).toBeUndefined();
      } finally {
        await runtime.dispose();
      }
    });
  });

  // ── restoreFromBackup() settings preservation ─────────────────────────

  describe("restoreFromBackup() settings preservation", () => {
    it("writes .restore-pending.json with all critical settings", async () => {
      // Seed settings that must survive the restore
      writeSetting(t.db, "backup.target_path", "/tmp/oi-test/Backups");
      writeSetting(t.db, "lan.enabled", "true");
      writeSetting(t.db, "lan.port", "8080");
      writeSetting(t.db, "lan.access_key", "secret-key-123");
      writeSetting(t.db, "app.language", "zh-CN");

      // Create a backup source directory with a valid database.db
      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-restore-"));
      tempDirs.push(backupDir);
      fs.copyFileSync(t.dbPath, path.join(backupDir, "database.db"));

      // Close the seeding connection before restore — Windows holds file locks
      // on open handles, preventing the rename that restoreFromBackup performs.
      t.db.close();

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      // restoreFromBackup will dispose the runtime, relaunch, and exit.
      // We just need to verify the .restore-pending.json file was written correctly.
      await coordinator.restoreFromBackup(backupDir);

      // Read the .restore-pending.json that was written before the runtime was disposed
      const pendingPath = path.join(t.dir, ".restore-pending.json");
      expect(fs.existsSync(pendingPath)).toBe(true);

      const pending = JSON.parse(fs.readFileSync(pendingPath, "utf-8"));
      expect(pending.preserveSettings).toEqual({
        "backup.target_path": "/tmp/oi-test/Backups",
        "backup.interval_value": "0",
        "backup.interval_unit": "hours",
        "backup.on_startup": "false",
        "lan.enabled": "true",
        "lan.port": "8080",
        "lan.access_key": "secret-key-123",
        "app.language": "zh-CN",
      });
      expect(pending.backupDir).toBe(backupDir);
      expect(pending.restoredAt).toBeDefined();
    });

    it("preserves default values when settings are not configured", async () => {
      // Don't seed any settings — test that defaults are captured
      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-defaults-"));
      tempDirs.push(backupDir);
      fs.copyFileSync(t.dbPath, path.join(backupDir, "database.db"));

      // Close the seeding connection before restore — Windows file lock compat
      t.db.close();

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      await coordinator.restoreFromBackup(backupDir);

      const pendingPath = path.join(t.dir, ".restore-pending.json");
      const pending = JSON.parse(fs.readFileSync(pendingPath, "utf-8"));

      // Unconfigured settings should be empty strings or defaults
      expect(pending.preserveSettings["backup.target_path"]).toBe("");
      expect(pending.preserveSettings["lan.enabled"]).toBe("false");
      expect(pending.preserveSettings["app.language"]).toBe("en");
    });
  });

  // ── restoreFromBackup() file operations ───────────────────────────────

  describe("restoreFromBackup() file operations", () => {
    it("creates safety copy, copies backup DB, and calls app.relaunch()", async () => {
      seedItem(t.db, { name: "Original Item", sku: "SKU-ORIG" });

      // Create a backup with different data
      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-fileops-"));
      tempDirs.push(backupDir);
      fs.copyFileSync(t.dbPath, path.join(backupDir, "database.db"));

      // Close the seeding connection before restore — Windows file lock compat
      t.db.close();

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      await coordinator.restoreFromBackup(backupDir);

      // Safety copy directory should exist
      const dataDir = t.dir;
      const safetyDirs = fs.readdirSync(dataDir).filter((d) => d.startsWith("database-pre-restore-"));
      expect(safetyDirs.length).toBe(1);

      // Safety copy should contain the original DB
      const safetyDbPath = path.join(dataDir, safetyDirs[0], path.basename(t.dbPath));
      expect(fs.existsSync(safetyDbPath)).toBe(true);

      // The main DB path should have the backup copy
      expect(fs.existsSync(t.dbPath)).toBe(true);

      // app.relaunch() and app.exit(0) should have been called
      expect(electronMocks.relaunch).toHaveBeenCalledTimes(1);
      expect(electronMocks.exit).toHaveBeenCalledWith(0);
    });

    it("throws when backup directory has no database.db", async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-coord-nodb-"));
      tempDirs.push(emptyDir);

      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      try {
        await expect(coordinator.restoreFromBackup(emptyDir)).rejects.toThrow(
          /No database\.db found/,
        );
      } finally {
        await runtime.dispose();
      }
    });
  });

  // ── awaitPendingBackup() ──────────────────────────────────────────────

  describe("awaitPendingBackup()", () => {
    it("resolves immediately when no backup is in-flight", async () => {
      const runtime = makeTestRuntime(t.dbPath);
      const BackupCoordinator = await loadCoordinator();
      const coordinator = new BackupCoordinator(runtime, t.dbPath);

      try {
        // Should not throw or hang
        await coordinator.awaitPendingBackup();
      } finally {
        await runtime.dispose();
      }
    });
  });
});
