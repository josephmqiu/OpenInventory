import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  readSchemaVersionSafe,
  backupBeforeMigrate,
} from "../../src/main/services/migrationSafety";
import { createTestDb, seedItem } from "../setup/test-db";

const cleanups: Array<() => void | Promise<void>> = [];

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
    const itemId = seedItem(t.db, { name: "Backup Me", currentQuantity: 42 });
    // Intentionally do NOT checkpoint — exercises the online backup API's WAL fold.

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
