import Database from "better-sqlite3";

interface Migration {
  version: number;
  apply: (db: Database.Database) => void;
}

/** Check whether a column exists on a table.
 *  SAFETY: `table` is interpolated into SQL — only pass trusted string literals. */
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

/** Drop a column if it exists (idempotent). Requires SQLite 3.35+.
 *  SAFETY: `table` and `column` are interpolated into SQL — only pass trusted string literals. */
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
  // TODO: suppliers and locations tables are intentionally kept — foreign key
  // references still exist in inventory_items. Removal deferred until those
  // FKs are cleaned up or the tables are repurposed.
  {
    version: 4,
    apply: (db) => {
      // Migrate freeform backup schedule/retention to structured format.
      // Read old values (tolerant: unknown → defaults).
      const getSetting = db.prepare(
        "SELECT value FROM app_settings WHERE key = ?",
      );
      const upsertSetting = db.prepare(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      );
      const deleteSetting = db.prepare(
        "DELETE FROM app_settings WHERE key = ?",
      );

      const oldSchedule =
        (getSetting.get("backup.schedule") as { value: string } | undefined)
          ?.value ?? "";
      const lower = oldSchedule.toLowerCase().trim();

      // Parse old freeform schedule into structured values.
      let intervalValue = 0;
      let intervalUnit = "hours";
      const onStartup = false;

      if (lower === "daily" || lower === "1d" || lower === "24h") {
        intervalValue = 1;
        intervalUnit = "days";
      } else if (lower === "weekly" || lower === "7d") {
        intervalValue = 1;
        intervalUnit = "weeks";
      } else {
        // Try to parse numeric hours like "4h", "8h", "12h", "4", "8"
        const match = lower.match(/^(\d+)\s*h?$/);
        if (match) {
          intervalValue = parseInt(match[1], 10);
          intervalUnit = "hours";
        }
        // Unknown values → 0 (no schedule), which is the safe default.
      }

      upsertSetting.run("backup.interval_value", String(intervalValue));
      upsertSetting.run("backup.interval_unit", intervalUnit);
      upsertSetting.run("backup.on_startup", onStartup ? "true" : "false");

      // Clean up old keys that are no longer used.
      deleteSetting.run("backup.schedule");
      deleteSetting.run("backup.retention");
      deleteSetting.run("backup.target_type");
      deleteSetting.run("backup.next_scheduled");
    },
  },
  {
    version: 5,
    apply: (db) => {
      // Drop unused channel_summary column from low_stock_alerts.
      // SQLite DROP COLUMN requires 3.35+ — better-sqlite3 bundles 3.45+.
      dropColumnIfExists(db, "low_stock_alerts", "channel_summary");
    },
  },
];

/** The highest migration version in this app build. Used by backup validation to reject future schemas. */
export const LATEST_MIGRATION_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

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
