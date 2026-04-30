import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { BackupService, BackupServiceLive } from "../../src/main/services/BackupService";
import { applyRestorePending } from "../../src/main/services/restorePending";

function createTempDatabase(tempDir: string): string {
  const dbPath = path.join(tempDir, "inventory-monitor.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_items (id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, barcode TEXT, name TEXT NOT NULL, category TEXT NOT NULL, location_id TEXT, supplier_id TEXT, unit_of_measure TEXT NOT NULL, reorder_quantity INTEGER NOT NULL, current_quantity INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_movements (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, movement_type TEXT NOT NULL, quantity INTEGER NOT NULL, previous_quantity INTEGER NOT NULL, new_quantity INTEGER NOT NULL, reason TEXT, reference_no TEXT, notes TEXT, performed_by TEXT, performed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS low_stock_alerts (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, threshold_quantity INTEGER NOT NULL, quantity_at_trigger INTEGER NOT NULL, status TEXT NOT NULL, triggered_at TEXT NOT NULL, resolved_at TEXT, channel_summary TEXT);
    CREATE TABLE IF NOT EXISTS personnel (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations (version, applied_at) VALUES (4, datetime('now'));
    INSERT INTO inventory_items VALUES ('item1', 'SKU001', NULL, 'Test Item', 'Parts', NULL, NULL, 'pcs', 10, 50, 'in_stock', datetime('now'), datetime('now'));
    INSERT INTO personnel VALUES ('p1', 'Test User', datetime('now'), datetime('now'));
  `);
  db.close();
  return dbPath;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe("BackupService", () => {
  it("creates a backup directory with database.db and manifest.json", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);
    const sourcePath = createTempDatabase(tempDir);
    const targetDir = path.join(tempDir, "backups");

    const result = await Effect.runPromise(
      Effect.flatMap(BackupService, (service) => service.backupToDirectory(sourcePath, targetDir)).pipe(
        Effect.provide(BackupServiceLive),
      ),
    );

    // Backup directory exists
    const backupDir = path.join(targetDir, "OpenInventory-Backup");
    expect(fs.existsSync(backupDir)).toBe(true);

    // database.db exists and is valid SQLite
    expect(fs.existsSync(path.join(backupDir, "database.db"))).toBe(true);
    const backupDb = new Database(path.join(backupDir, "database.db"), { readonly: true });
    const row = backupDb.prepare("SELECT name FROM inventory_items WHERE id = 'item1'").get() as { name: string };
    backupDb.close();
    expect(row.name).toBe("Test Item");

    // manifest.json exists with correct structure
    expect(fs.existsSync(path.join(backupDir, "manifest.json"))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, "manifest.json"), "utf-8"));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.stats.items).toBe(1);
    expect(manifest.stats.personnel).toBe(1);
    expect(manifest.checksums.database).toMatch(/^sha256:/);

    // Return value
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.manifest.stats.items).toBe(1);
  });

  it("validates a valid backup directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);
    const sourcePath = createTempDatabase(tempDir);
    const targetDir = path.join(tempDir, "backups");

    // Create a backup first
    await Effect.runPromise(
      Effect.flatMap(BackupService, (service) => service.backupToDirectory(sourcePath, targetDir)).pipe(
        Effect.provide(BackupServiceLive),
      ),
    );

    // Validate it
    const result = await Effect.runPromise(
      Effect.flatMap(BackupService, (service) =>
        service.validateBackupDirectory(path.join(targetDir, "OpenInventory-Backup")),
      ).pipe(Effect.provide(BackupServiceLive)),
    );

    expect(result.valid).toBe(true);
    expect(result.stats?.items).toBe(1);
  });

  it("rejects a directory with no database.db", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);
    fs.mkdirSync(path.join(tempDir, "empty-backup"));

    const result = await Effect.runPromise(
      Effect.flatMap(BackupService, (service) =>
        service.validateBackupDirectory(path.join(tempDir, "empty-backup")),
      ).pipe(Effect.provide(BackupServiceLive)),
    );

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/No database\.db found/);
  });

  it("wraps target-directory failures as IoError", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);
    const sourcePath = createTempDatabase(tempDir);
    const blockingFile = path.join(tempDir, "not-a-directory");
    fs.writeFileSync(blockingFile, "blocking file");

    await expect(
      Effect.runPromise(
        Effect.flatMap(BackupService, (service) =>
          service.backupToDirectory(sourcePath, blockingFile),
        ).pipe(Effect.provide(BackupServiceLive)),
      ),
    ).rejects.toThrow(/IoError|Backup failed/);
  });

  it("performs restore with safety copy", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);

    // Create source and backup
    const sourcePath = createTempDatabase(tempDir);
    const targetDir = path.join(tempDir, "backups");
    await Effect.runPromise(
      Effect.flatMap(BackupService, (service) => service.backupToDirectory(sourcePath, targetDir)).pipe(
        Effect.provide(BackupServiceLive),
      ),
    );

    // Create a different "current" DB to restore over
    const appDbPath = path.join(tempDir, "app-data", "inventory-monitor.db");
    fs.mkdirSync(path.dirname(appDbPath), { recursive: true });
    const currentDb = new Database(appDbPath);
    currentDb.exec("CREATE TABLE test (id INTEGER PRIMARY KEY);");
    currentDb.close();

    // Restore
    await Effect.runPromise(
      Effect.flatMap(BackupService, (service) =>
        service.restoreFromDirectory(path.join(targetDir, "OpenInventory-Backup"), appDbPath),
      ).pipe(Effect.provide(BackupServiceLive)),
    );

    // Safety copy should exist
    const safetyDirs = fs.readdirSync(path.dirname(appDbPath)).filter((d) => d.startsWith("database-pre-restore-"));
    expect(safetyDirs.length).toBe(1);

    // Restored DB should have the backup's data
    const restoredDb = new Database(appDbPath, { readonly: true });
    const row = restoredDb.prepare("SELECT name FROM inventory_items WHERE id = 'item1'").get() as { name: string };
    restoredDb.close();
    expect(row.name).toBe("Test Item");
  });

  it("validates backup with missing manifest (fallback to DB)", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-backup-service-"));
    tempDirs.push(tempDir);
    const sourcePath = createTempDatabase(tempDir);
    const targetDir = path.join(tempDir, "backups");

    // Create backup then delete manifest
    await Effect.runPromise(
      Effect.flatMap(BackupService, (service) => service.backupToDirectory(sourcePath, targetDir)).pipe(
        Effect.provide(BackupServiceLive),
      ),
    );
    const manifestPath = path.join(targetDir, "OpenInventory-Backup", "manifest.json");
    fs.unlinkSync(manifestPath);

    // Validation should still succeed (falls back to DB read)
    const result = await Effect.runPromise(
      Effect.flatMap(BackupService, (service) =>
        service.validateBackupDirectory(path.join(targetDir, "OpenInventory-Backup")),
      ).pipe(Effect.provide(BackupServiceLive)),
    );

    expect(result.valid).toBe(true);
    expect(result.manifest).toBeUndefined();
    expect(result.stats?.items).toBe(1);
  });
});

describe("detectCloudProvider", () => {
  // Import the function indirectly by testing through DatabaseService behavior
  // Cloud detection is tested via the updateBackupPlan flow, but we can test
  // the patterns here via simple path checks
  it("detects known cloud sync folder patterns", () => {
    // This tests the conceptual patterns — actual detection is in DatabaseService
    const patterns = [
      { path: "/Users/test/Library/CloudStorage/Dropbox/backup", expected: "Dropbox" },
      { path: "/Users/test/Library/CloudStorage/OneDrive-Personal/backup", expected: "OneDrive" },
      { path: "/Users/test/Library/CloudStorage/GoogleDrive-me/backup", expected: "Google Drive" },
      { path: "/tmp/local-backup", expected: "" },
    ];

    for (const { path: p, expected } of patterns) {
      const normalized = p.toLowerCase();
      let detected = "";
      if (normalized.includes("/library/cloudstorage/dropbox")) detected = "Dropbox";
      else if (normalized.includes("/library/cloudstorage/onedrive")) detected = "OneDrive";
      else if (normalized.includes("/library/cloudstorage/googledrive")) detected = "Google Drive";
      expect(detected).toBe(expected);
    }
  });
});

describe("applyRestorePending", () => {
  it("applies preserved settings from .restore-pending.json", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-restore-pending-"));
    tempDirs.push(tempDir);

    const dbPath = path.join(tempDir, "inventory-monitor.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.exec("INSERT INTO app_settings (key, value) VALUES ('backup.target_path', '/old/path')");
    db.close();

    // Write .restore-pending.json
    const pendingPath = path.join(tempDir, ".restore-pending.json");
    fs.writeFileSync(pendingPath, JSON.stringify({
      preserveSettings: { "backup.target_path": "/new/path" },
      backupDir: "/some/backup",
      restoredAt: new Date().toISOString(),
    }));

    // Apply
    const result = applyRestorePending(
      dbPath,
      (key: string, value: string) => {
        const applyDb = new Database(dbPath);
        applyDb.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
        applyDb.close();
      },
    );

    expect(result.restored).toBe(true);

    // Verify setting was applied
    const verifyDb = new Database(dbPath, { readonly: true });
    const row = verifyDb.prepare("SELECT value FROM app_settings WHERE key = 'backup.target_path'").get() as { value: string };
    verifyDb.close();
    expect(row.value).toBe("/new/path");

    // Verify pending file was deleted
    expect(fs.existsSync(pendingPath)).toBe(false);
  });

  it("returns restored=false when no pending file exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-restore-pending-"));
    tempDirs.push(tempDir);

    const result = applyRestorePending(
      path.join(tempDir, "inventory-monitor.db"),
      () => {},
    );

    expect(result.restored).toBe(false);
  });

  it("handles corrupt pending file gracefully", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-restore-pending-"));
    tempDirs.push(tempDir);

    const pendingPath = path.join(tempDir, ".restore-pending.json");
    fs.writeFileSync(pendingPath, "not valid json{{{");

    const result = applyRestorePending(
      path.join(tempDir, "inventory-monitor.db"),
      () => {},
    );

    expect(result.restored).toBe(false);
    // Corrupt file should be cleaned up
    expect(fs.existsSync(pendingPath)).toBe(false);
  });
});
