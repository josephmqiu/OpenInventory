import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import {
  readSchemaVersionSafe,
  backupBeforeMigrate,
  findLatestPreUpdateBackup,
  restorePreUpdateBackup,
  readRollbackMarker,
  writeRollbackMarker,
  clearRollbackMarker,
  isBlockedByRollback,
  prunePreUpdateBackups,
} from "../../src/main/services/migrationSafety";
import { createTestDb, seedItem } from "../setup/test-db";

const cleanups: Array<() => void | Promise<void>> = [];

/** Create a one-table SQLite file carrying a known marker value (no .exec). */
function makeDbWithMarker(file: string, value: string): void {
  const db = new Database(file);
  db.prepare("CREATE TABLE marker (v TEXT)").run();
  db.prepare("INSERT INTO marker VALUES (?)").run(value);
  db.close();
}

function readMarker(file: string): string {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare("SELECT v FROM marker").get() as { v: string }).v;
  } finally {
    db.close();
  }
}

afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

describe("readSchemaVersionSafe", () => {
  it("returns 0 when the schema_migrations table is absent (pre-migration DB)", () => {
    const db = new Database(":memory:");
    cleanups.push(() => db.close());
    expect(readSchemaVersionSafe(db)).toBe(0);
  });

  it("returns the highest applied migration version", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);
    expect(readSchemaVersionSafe(t.db)).toBe(0); // table exists but empty
    const stamp = t.db.prepare(
      "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
    );
    stamp.run(1);
    stamp.run(5);
    stamp.run(3);
    expect(readSchemaVersionSafe(t.db)).toBe(5);
  });
});

describe("backupBeforeMigrate", () => {
  it("writes a verified, consistent snapshot (folding in uncheckpointed WAL)", async () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);
    // Force WAL mode and write without checkpointing, so the row lives only in the
    // -wal file. This exercises the online backup API's WAL fold (production runs WAL).
    t.db.pragma("journal_mode = WAL");
    const itemId = seedItem(t.db, { name: "Backup Me", currentQuantity: 42 });
    expect(fs.existsSync(`${t.dbPath}-wal`)).toBe(true);

    const dir = await backupBeforeMigrate(t.db, t.dbPath, 3, 6);

    expect(path.basename(dir)).toMatch(/^migrate-v3-to-v6-/);
    const backupDb = path.join(dir, "database.db");
    expect(fs.existsSync(backupDb)).toBe(true);

    const restored = new Database(backupDb, { readonly: true });
    try {
      const row = restored
        .prepare("SELECT name, current_quantity FROM inventory_items WHERE id = ?")
        .get(itemId) as { name: string; current_quantity: number };
      expect(row.name).toBe("Backup Me");
      expect(row.current_quantity).toBe(42);
      expect(
        (restored.prepare("PRAGMA integrity_check(1)").get() as { integrity_check: string })
          .integrity_check,
      ).toBe("ok");
    } finally {
      restored.close();
    }
  });

  it("nests the snapshot under pre-update-backups next to the database", async () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);
    const dir = await backupBeforeMigrate(t.db, t.dbPath, 0, 6);
    expect(path.dirname(dir)).toBe(path.join(path.dirname(t.dbPath), "pre-update-backups"));
  });
});

describe("findLatestPreUpdateBackup", () => {
  it("returns null when there is no pre-update-backups directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-find-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    expect(findLatestPreUpdateBackup(path.join(dir, "inventory-monitor.db"))).toBeNull();
  });

  it("returns the newest backup and ignores dirs without database.db", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-find-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");
    const root = path.join(dir, "pre-update-backups");

    const older = path.join(root, "migrate-v3-to-v6-2000");
    const newer = path.join(root, "migrate-v3-to-v6-2020");
    const empty = path.join(root, "no-db-here");
    fs.mkdirSync(older, { recursive: true });
    fs.mkdirSync(newer, { recursive: true });
    fs.mkdirSync(empty, { recursive: true });
    makeDbWithMarker(path.join(older, "database.db"), "older");
    makeDbWithMarker(path.join(newer, "database.db"), "newer");

    fs.utimesSync(path.join(older, "database.db"), new Date(2000, 0, 1), new Date(2000, 0, 1));
    fs.utimesSync(path.join(newer, "database.db"), new Date(2020, 0, 1), new Date(2020, 0, 1));

    expect(findLatestPreUpdateBackup(dbPath)).toBe(newer);
  });

  it("finds a nested auto-update backup (database.db one level deeper)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-find-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");
    // Mirrors BackupCoordinator: pre-update-backups/<version>-<ts>/<BACKUP_DIR>/database.db
    const nested = path.join(dir, "pre-update-backups", "0.1.6-2026", "OpenInventory-Backup");
    fs.mkdirSync(nested, { recursive: true });
    makeDbWithMarker(path.join(nested, "database.db"), "auto-update");

    expect(findLatestPreUpdateBackup(dbPath)).toBe(nested);
  });

  it("skips a corrupt backup", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-find-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");
    const bad = path.join(dir, "pre-update-backups", "migrate-v3-to-v6-bad");
    fs.mkdirSync(bad, { recursive: true });
    fs.writeFileSync(path.join(bad, "database.db"), "not a sqlite file");

    expect(findLatestPreUpdateBackup(dbPath)).toBeNull();
  });
});

describe("restorePreUpdateBackup", () => {
  it("swaps in the backup, clears stale WAL/SHM, and preserves the broken DB", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-restore-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");

    const backupDir = path.join(dir, "pre-update-backups", "migrate-v3-to-v6-x");
    fs.mkdirSync(backupDir, { recursive: true });
    makeDbWithMarker(path.join(backupDir, "database.db"), "from-backup");

    makeDbWithMarker(dbPath, "broken-live");
    fs.writeFileSync(`${dbPath}-wal`, "stale-wal");
    fs.writeFileSync(`${dbPath}-shm`, "stale-shm");

    restorePreUpdateBackup(dbPath, backupDir);

    expect(readMarker(dbPath)).toBe("from-backup");
    // Stale WAL/SHM must be gone — applying them over the restore would corrupt it.
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${dbPath}-shm`)).toBe(false);
    // The broken DB is preserved for forensics.
    const failed = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith("database-failed-update-"));
    expect(failed.length).toBe(1);
    expect(readMarker(path.join(dir, failed[0], "inventory-monitor.db"))).toBe("broken-live");
  });

  it("leaves the live DB untouched when the backup is corrupt (fail-safe)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-restore-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");

    const backupDir = path.join(dir, "pre-update-backups", "migrate-v3-to-v6-bad");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, "database.db"), "corrupt"); // not a real DB

    makeDbWithMarker(dbPath, "live-data");

    expect(() => restorePreUpdateBackup(dbPath, backupDir)).toThrow();

    // Live DB is intact, no staged temp left behind, nothing moved aside.
    expect(readMarker(dbPath)).toBe("live-data");
    expect(fs.existsSync(`${dbPath}.restore-tmp`)).toBe(false);
    expect(fs.readdirSync(dir).some((n) => n.startsWith("database-failed-update-"))).toBe(false);
  });
});

describe("rollback marker (loop guard)", () => {
  it("round-trips and gates only the same app build on the same data state", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-marker-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");

    expect(readRollbackMarker(dbPath)).toBeNull();
    expect(isBlockedByRollback(dbPath, "0.1.6", 5)).toBe(false);

    writeRollbackMarker(dbPath, { appVersion: "0.1.6", schemaVersion: 5, at: new Date().toISOString() });
    expect(readRollbackMarker(dbPath)?.schemaVersion).toBe(5);

    // Same build that failed, same restored data state → halt (no loop).
    expect(isBlockedByRollback(dbPath, "0.1.6", 5)).toBe(true);
    // A newer build (the fix) is never blocked.
    expect(isBlockedByRollback(dbPath, "0.1.7", 5)).toBe(false);
    // Same build but different data state → not the same failure, proceed.
    expect(isBlockedByRollback(dbPath, "0.1.6", 6)).toBe(false);

    clearRollbackMarker(dbPath);
    expect(readRollbackMarker(dbPath)).toBeNull();
  });
});

describe("prunePreUpdateBackups", () => {
  function makeBackup(root: string, name: string, mtimeYear: number): string {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    const dbFile = path.join(dir, "database.db");
    makeDbWithMarker(dbFile, name);
    fs.utimesSync(dbFile, new Date(mtimeYear, 0, 1), new Date(mtimeYear, 0, 1));
    return dir;
  }

  it("keeps the newest N and deletes older ones", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-prune-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");
    const root = path.join(dir, "pre-update-backups");
    for (const year of [2018, 2019, 2020, 2021, 2022]) {
      makeBackup(root, `migrate-v3-to-v6-${year}`, year);
    }

    const removed = prunePreUpdateBackups(dbPath, 3);

    expect(removed.length).toBe(2);
    const surviving = fs.readdirSync(root).sort();
    expect(surviving).toEqual([
      "migrate-v3-to-v6-2020",
      "migrate-v3-to-v6-2021",
      "migrate-v3-to-v6-2022",
    ]);
  });

  it("never deletes the last backup even when keep is 0", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-prune-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dbPath = path.join(dir, "inventory-monitor.db");
    const root = path.join(dir, "pre-update-backups");
    makeBackup(root, "migrate-v3-to-v6-2020", 2020);
    makeBackup(root, "migrate-v3-to-v6-2022", 2022);

    prunePreUpdateBackups(dbPath, 0);

    expect(fs.readdirSync(root)).toEqual(["migrate-v3-to-v6-2022"]);
  });

  it("is a no-op when there is no backups directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-prune-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    expect(prunePreUpdateBackups(path.join(dir, "inventory-monitor.db"))).toEqual([]);
  });
});
