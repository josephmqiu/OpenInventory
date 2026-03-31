/**
 * Category E: Migration tests (5 tests)
 *
 * Tests the migration system that will be ported from
 * src-tauri/src/infrastructure/migrations.rs.
 * Verifies fresh DB, idempotent re-run, legacy column cleanup, and schema shape.
 */
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  createTestDb,
  createLegacyTestDb,
  type TestDb,
} from "../setup/test-db";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

// ─── Migration helpers matching the Rust implementation ──────────────────────

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
    );
  `);
}

function currentVersion(db: Database.Database): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) as v FROM schema_migrations")
    .get() as { v: number };
  return row.v;
}

interface Migration {
  version: number;
  apply: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    apply: () => {
      /* baseline — no-op */
    },
  },
  {
    version: 2,
    apply: (db: Database.Database) => {
      // Drop dead columns from inventory_items
      const hasDeadColumns = db
        .prepare(
          "SELECT COUNT(*) as c FROM pragma_table_info('inventory_items') WHERE name = 'min_quantity'",
        )
        .get() as { c: number };

      if (hasDeadColumns.c === 0) return;

      db.exec(`
        CREATE TABLE inventory_items_new (
            id TEXT PRIMARY KEY,
            sku TEXT NOT NULL UNIQUE,
            barcode TEXT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            location_id TEXT,
            supplier_id TEXT,
            unit_of_measure TEXT NOT NULL,
            reorder_quantity INTEGER NOT NULL,
            current_quantity INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(location_id) REFERENCES locations(id),
            FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
        );

        INSERT INTO inventory_items_new
            SELECT id, sku, barcode, name, category, location_id, supplier_id,
                   unit_of_measure, reorder_quantity, current_quantity, status,
                   created_at, updated_at
            FROM inventory_items;

        DROP TABLE inventory_items;
        ALTER TABLE inventory_items_new RENAME TO inventory_items;

        CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
        CREATE INDEX IF NOT EXISTS idx_inventory_items_current_quantity ON inventory_items(current_quantity);
      `);

      // Drop dead columns from suppliers
      const hasSupplierDeadColumns = db
        .prepare(
          "SELECT COUNT(*) as c FROM pragma_table_info('suppliers') WHERE name = 'contact_name'",
        )
        .get() as { c: number };

      if (hasSupplierDeadColumns.c > 0) {
        db.exec(`
          CREATE TABLE suppliers_new (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
          );
          INSERT INTO suppliers_new SELECT id, name, created_at, updated_at FROM suppliers;
          DROP TABLE suppliers;
          ALTER TABLE suppliers_new RENAME TO suppliers;
        `);
      }

      // Drop dead columns from low_stock_alerts
      const hasAlertDeadColumns = db
        .prepare(
          "SELECT COUNT(*) as c FROM pragma_table_info('low_stock_alerts') WHERE name = 'acknowledged_by'",
        )
        .get() as { c: number };

      if (hasAlertDeadColumns.c > 0) {
        db.exec(`
          CREATE TABLE low_stock_alerts_new (
              id TEXT PRIMARY KEY,
              item_id TEXT NOT NULL,
              threshold_quantity INTEGER NOT NULL,
              quantity_at_trigger INTEGER NOT NULL,
              status TEXT NOT NULL,
              triggered_at TEXT NOT NULL,
              resolved_at TEXT,
              channel_summary TEXT,
              FOREIGN KEY(item_id) REFERENCES inventory_items(id)
          );
          INSERT INTO low_stock_alerts_new
              SELECT id, item_id, threshold_quantity, quantity_at_trigger,
                     status, triggered_at, resolved_at, channel_summary
              FROM low_stock_alerts;
          DROP TABLE low_stock_alerts;
          ALTER TABLE low_stock_alerts_new RENAME TO low_stock_alerts;

          CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_item_status ON low_stock_alerts(item_id, status);
        `);
      }

      // Drop audit_logs table
      db.exec("DROP TABLE IF EXISTS audit_logs;");
    },
  },
];

function runPendingMigrations(db: Database.Database): void {
  ensureMigrationsTable(db);
  const current = currentVersion(db);

  for (const migration of MIGRATIONS.filter((m) => m.version > current)) {
    const applyInTransaction = db.transaction(() => {
      migration.apply(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now', 'localtime'))",
      ).run(migration.version);
    });
    applyInTransaction();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("migration system", () => {
  it("runs all migrations on a fresh database", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    runPendingMigrations(t.db);

    const version = currentVersion(t.db);
    expect(version).toBe(2);

    const count = t.db
      .prepare("SELECT COUNT(*) as c FROM schema_migrations")
      .get() as { c: number };
    expect(count.c).toBe(2);
  });

  it("is idempotent — running twice does not duplicate entries", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    runPendingMigrations(t.db);
    runPendingMigrations(t.db);

    const count = t.db
      .prepare("SELECT COUNT(*) as c FROM schema_migrations")
      .get() as { c: number };
    expect(count.c).toBe(2);
    expect(currentVersion(t.db)).toBe(2);
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

  it("migration v2 is a no-op on clean databases (no dead columns)", () => {
    const t = createTestDb();
    cleanups.push(t.cleanup);

    // Clean DB has no dead columns — migration 2 should not error
    runPendingMigrations(t.db);

    expect(currentVersion(t.db)).toBe(2);

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
});
