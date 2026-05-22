/**
 * Category E: Migration tests
 *
 * Tests the production migration runner from src/main/infrastructure/migrations.ts.
 * Verifies fresh DB, idempotent re-run, legacy column cleanup, child-row safety,
 * and final schema shape.
 */
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import {
  runPendingMigrations,
  ensureMigrationsTable,
  currentVersion,
} from "../../src/main/infrastructure/migrations";
import {
  createTestDb,
  createLegacyTestDb,
  seedItem,
  seedMovement,
  seedAlert,
} from "../setup/test-db";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("migration system", () => {
  it("runs all migrations on a fresh database", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    runPendingMigrations(t.db);

    const version = currentVersion(t.db);
    expect(version).toBe(5);

    const count = t.db
      .prepare("SELECT COUNT(*) as c FROM schema_migrations")
      .get() as { c: number };
    expect(count.c).toBe(5);
  });

  it("is idempotent — running twice does not duplicate entries", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    runPendingMigrations(t.db);
    runPendingMigrations(t.db);

    const count = t.db
      .prepare("SELECT COUNT(*) as c FROM schema_migrations")
      .get() as { c: number };
    expect(count.c).toBe(5);
    expect(currentVersion(t.db)).toBe(5);
  });

  it("migration v2 removes dead columns from legacy database", () => {
    const t = createLegacyTestDb();
    cleanups.push(t.cleanup);

    // Verify dead columns exist before migration
    const beforeCols = t.db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('inventory_items') WHERE name = 'min_quantity'")
      .get() as { c: number };
    expect(beforeCols.c).toBe(1);

    runPendingMigrations(t.db);

    // After migration, dead columns are gone
    const afterCols = t.db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('inventory_items') WHERE name = 'min_quantity'")
      .get() as { c: number };
    expect(afterCols.c).toBe(0);

    // audit_logs table dropped
    const auditTable = t.db
      .prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='audit_logs'")
      .get() as { c: number };
    expect(auditTable.c).toBe(0);

    // Supplier dead columns removed
    const supplierCols = t.db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('suppliers') WHERE name = 'contact_name'")
      .get() as { c: number };
    expect(supplierCols.c).toBe(0);

    // Alert dead columns removed
    const alertCols = t.db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('low_stock_alerts') WHERE name = 'acknowledged_by'")
      .get() as { c: number };
    expect(alertCols.c).toBe(0);
  });

  it("migration v2 succeeds with existing child rows (movements + alerts)", () => {
    const t = createLegacyTestDb();
    cleanups.push(t.cleanup);

    // Seed data with child rows referencing inventory_items
    const itemId = seedItem(t.db, { currentQuantity: 5, reorderQuantity: 10 });
    seedMovement(t.db, itemId, { type: "receive", quantity: 50 });
    seedMovement(t.db, itemId, { type: "issue", quantity: 10 });
    seedAlert(t.db, itemId, { status: "open" });

    // This is the critical test: migration must succeed with child rows present.
    // The old table-rebuild approach (DROP TABLE + RENAME) would fail here because
    // foreign key constraints on inventory_movements and low_stock_alerts reference
    // inventory_items. ALTER TABLE DROP COLUMN avoids this entirely.
    runPendingMigrations(t.db);

    expect(currentVersion(t.db)).toBe(5);

    // Verify child data is preserved
    const movements = t.db
      .prepare("SELECT COUNT(*) as c FROM inventory_movements WHERE item_id = ?")
      .get(itemId) as { c: number };
    expect(movements.c).toBe(2);

    const alerts = t.db
      .prepare("SELECT COUNT(*) as c FROM low_stock_alerts WHERE item_id = ?")
      .get(itemId) as { c: number };
    expect(alerts.c).toBe(1);

    // Verify dead columns are gone
    const deadCol = t.db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('inventory_items') WHERE name = 'min_quantity'")
      .get() as { c: number };
    expect(deadCol.c).toBe(0);
  });

  it("migration v2 is a no-op on clean databases (no dead columns)", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    // Clean DB has no dead columns — migration 2 should not error
    runPendingMigrations(t.db);

    expect(currentVersion(t.db)).toBe(5);

    // Schema still intact
    const items = t.db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('inventory_items')")
      .get() as { c: number };
    expect(items.c).toBeGreaterThan(0);
  });

  it("final schema has expected table structure", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    runPendingMigrations(t.db);

    const tables = t.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("inventory_items");
    expect(tableNames).toContain("inventory_movements");
    expect(tableNames).toContain("low_stock_alerts");
    expect(tableNames).toContain("personnel");
    expect(tableNames).toContain("suppliers");
    expect(tableNames).toContain("locations");
    expect(tableNames).toContain("app_settings");
    expect(tableNames).toContain("schema_migrations");
    expect(tableNames).not.toContain("audit_logs");

    // Verify inventory_items columns
    const itemCols = t.db
      .prepare("SELECT name FROM pragma_table_info('inventory_items') ORDER BY name")
      .all() as { name: string }[];
    const colNames = itemCols.map((c) => c.name);

    expect(colNames).toContain("id");
    expect(colNames).toContain("sku");
    expect(colNames).toContain("name");
    expect(colNames).toContain("current_quantity");
    expect(colNames).toContain("reorder_quantity");
    expect(colNames).toContain("status");
    expect(colNames).not.toContain("min_quantity");
    expect(colNames).not.toContain("description");
    expect(colNames).not.toContain("cost_per_unit");
  });

  it("migration v4 converts freeform 'daily' schedule to structured format", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    // Simulate old freeform schedule
    t.db.exec("INSERT INTO app_settings (key, value) VALUES ('backup.schedule', 'daily')");
    t.db.exec("INSERT INTO app_settings (key, value) VALUES ('backup.retention', '7 days')");
    t.db.exec("INSERT INTO app_settings (key, value) VALUES ('backup.target_type', 'local_folder')");

    runPendingMigrations(t.db);

    const getSetting = (key: string) =>
      (t.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;

    // New structured keys
    expect(getSetting("backup.interval_value")).toBe("1");
    expect(getSetting("backup.interval_unit")).toBe("days");
    expect(getSetting("backup.on_startup")).toBe("false");

    // Old keys removed
    expect(getSetting("backup.schedule")).toBeUndefined();
    expect(getSetting("backup.retention")).toBeUndefined();
    expect(getSetting("backup.target_type")).toBeUndefined();
    expect(getSetting("backup.next_scheduled")).toBeUndefined();
  });

  it("migration v4 defaults unknown schedule strings to 0 (no schedule)", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    t.db.exec("INSERT INTO app_settings (key, value) VALUES ('backup.schedule', 'banana')");

    runPendingMigrations(t.db);

    const getSetting = (key: string) =>
      (t.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;

    expect(getSetting("backup.interval_value")).toBe("0");
    expect(getSetting("backup.interval_unit")).toBe("hours");
  });

  it("migration v4 converts numeric hour schedules", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    t.db.exec("INSERT INTO app_settings (key, value) VALUES ('backup.schedule', '4h')");

    runPendingMigrations(t.db);

    const getSetting = (key: string) =>
      (t.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;

    expect(getSetting("backup.interval_value")).toBe("4");
    expect(getSetting("backup.interval_unit")).toBe("hours");
  });
});

// ─── Schema equivalence (C4) ─────────────────────────────────────────────────
// initializeDatabase() runs schema.sql AND the migration chain on every boot, for
// both fresh installs and upgrades. These tests assert the two paths converge to
// the same schema, so a column added to schema.sql without a matching migration
// (which CREATE TABLE IF NOT EXISTS cannot apply to an existing table) is caught.

const PROD_SCHEMA = readFileSync(
  join(__dirname, "../../src/main/infrastructure/schema.sql"),
  "utf-8",
);

type Row = Record<string, unknown>;

/** Apply a multi-statement schema file via prepared statements (no shell). */
function applySchema(db: Database.Database, sql: string): void {
  const withoutComments = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  for (const statement of withoutComments.split(";")) {
    const trimmed = statement.trim();
    if (trimmed) db.prepare(trimmed).run();
  }
}

/** Order-stable, name-normalized structural snapshot of a database's schema.
 *  Auto-generated (UNIQUE/PK) index names are excluded — only their shape is
 *  compared — since those names can differ across creation paths. */
function canonicalSchema(db: Database.Database) {
  const tables = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Row[]
  ).map((r) => String(r.name));

  const perTable: Record<string, unknown> = {};
  for (const t of tables) {
    const columns = (db.prepare("SELECT * FROM pragma_table_xinfo(?)").all(t) as Row[])
      .map((c) => ({
        name: String(c.name),
        type: c.type,
        notnull: c.notnull,
        dflt: c.dflt_value,
        pk: c.pk,
        hidden: c.hidden,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const indexes = (db.prepare("SELECT * FROM pragma_index_list(?)").all(t) as Row[])
      .map((idx) => ({
        name: idx.origin === "c" ? String(idx.name) : null,
        unique: idx.unique,
        origin: idx.origin,
        columns: (
          db
            .prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
            .all(String(idx.name)) as Row[]
        ).map((c) => String(c.name)),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    const fks = (db.prepare("SELECT * FROM pragma_foreign_key_list(?)").all(t) as Row[])
      .map((fk) => ({
        from: fk.from,
        table: fk.table,
        to: fk.to,
        onUpdate: fk.on_update,
        onDelete: fk.on_delete,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    perTable[t] = { columns, indexes, fks };
  }

  const others = (
    db
      .prepare(
        "SELECT type, name FROM sqlite_master WHERE type IN ('trigger','view') ORDER BY name",
      )
      .all() as Row[]
  ).map((o) => ({ type: o.type, name: String(o.name) }));

  return { tables, perTable, others };
}

/** Strip comments, blank lines, and PRAGMA directives so two schema files can be
 *  compared on DDL alone. */
function ddlOnly(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) => l !== "" && !l.startsWith("--") && !l.toUpperCase().startsWith("PRAGMA"),
    )
    .join("\n");
}

describe("schema equivalence (fresh ≡ legacy upgrade)", () => {
  it("a fresh install and a fully-upgraded legacy DB converge to the same schema", () => {
    // DB-A: fresh = production schema.sql + full migration chain.
    const fresh = new Database(":memory:");
    cleanups.push(() => {
      if (fresh.open) fresh.close();
    });
    applySchema(fresh, PROD_SCHEMA);
    runPendingMigrations(fresh);

    // DB-B: upgrade = legacy baseline + schema.sql + chain, mirroring how
    // initializeDatabase() runs schema.sql then migrations on every boot.
    const upgraded = createLegacyTestDb();
    cleanups.push(upgraded.cleanup);
    applySchema(upgraded.db, PROD_SCHEMA);
    runPendingMigrations(upgraded.db);

    expect(canonicalSchema(upgraded.db)).toEqual(canonicalSchema(fresh));
    expect(upgraded.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("the test-harness schema.sql copy has not drifted from production (DDL only)", () => {
    const testCopy = readFileSync(join(__dirname, "../setup/schema.sql"), "utf-8");
    expect(ddlOnly(testCopy)).toBe(ddlOnly(PROD_SCHEMA));
  });
});
