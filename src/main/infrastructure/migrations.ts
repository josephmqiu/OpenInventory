import Database from "better-sqlite3";

interface Migration {
  version: number;
  apply: (db: Database.Database) => void;
}

/** Check whether a column exists on a table. */
function hasColumn(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM pragma_table_info('${table}') WHERE name = ?`,
    )
    .get(column) as { c: number };
  return row.c > 0;
}

/** Drop a column if it exists (idempotent). Requires SQLite 3.35+. */
function dropColumnIfExists(
  db: Database.Database,
  table: string,
  column: string,
): void {
  if (hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
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
      // Remove dead columns from inventory_items
      dropColumnIfExists(db, "inventory_items", "min_quantity");
      dropColumnIfExists(db, "inventory_items", "description");
      dropColumnIfExists(db, "inventory_items", "cost_per_unit");

      // Ensure indexes exist on inventory_items (may not exist on older DBs)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
        CREATE INDEX IF NOT EXISTS idx_inventory_items_current_quantity ON inventory_items(current_quantity);
      `);

      // Remove dead columns from suppliers
      dropColumnIfExists(db, "suppliers", "contact_name");
      dropColumnIfExists(db, "suppliers", "phone");
      dropColumnIfExists(db, "suppliers", "email");

      // Remove dead columns from low_stock_alerts
      dropColumnIfExists(db, "low_stock_alerts", "acknowledged_by");
      dropColumnIfExists(db, "low_stock_alerts", "acknowledged_at");

      // Ensure index exists on low_stock_alerts
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_item_status ON low_stock_alerts(item_id, status);
      `);

      // Drop audit_logs table
      db.exec("DROP TABLE IF EXISTS audit_logs;");
    },
  },
  {
    version: 3,
    apply: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_performed_at
          ON inventory_movements(performed_at);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_type
          ON inventory_movements(movement_type);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_performed_by
          ON inventory_movements(performed_by);
      `);
    },
  },
];

export function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
    );
  `);
}

export function currentVersion(db: Database.Database): number {
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
