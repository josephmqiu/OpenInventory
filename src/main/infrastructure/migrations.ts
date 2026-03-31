import Database from "better-sqlite3";

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
    apply: (db) => {
      // Drop dead columns from inventory_items
      const hasDeadColumns = db
        .prepare(
          "SELECT COUNT(*) as c FROM pragma_table_info('inventory_items') WHERE name = 'min_quantity'",
        )
        .get() as { c: number };

      if (hasDeadColumns.c === 0) return;

      // Temporarily disable FK enforcement so DROP TABLE succeeds even
      // when child rows exist in inventory_movements / low_stock_alerts.
      db.pragma("foreign_keys = OFF");

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

      // Re-enable FK enforcement after all table rebuilds are complete.
      db.pragma("foreign_keys = ON");
    },
  },
];

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

export function runPendingMigrations(db: Database.Database): void {
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
