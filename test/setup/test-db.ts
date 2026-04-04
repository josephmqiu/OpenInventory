import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";

const SCHEMA_SQL = fs.readFileSync(
  path.join(__dirname, "schema.sql"),
  "utf-8",
);

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
`;

export interface TestDb {
  db: Database.Database;
  dir: string;
  dbPath: string;
  cleanup: () => void;
}

export function createTestDb(): TestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinventory-test-"));
  const dbPath = path.join(dir, "inventory-monitor.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  db.exec(MIGRATIONS_TABLE);
  return {
    db,
    dir,
    dbPath,
    cleanup: async () => {
      if (db.open) db.close();
      await tryRemoveDir(dir);
    },
  };
}

/** On Windows, SQLite file handles may not release immediately after db.close().
 *  Retry rmSync with exponential back-off to avoid EBUSY failures in CI. */
async function tryRemoveDir(dir: string, retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err: unknown) {
      if (i === retries - 1) throw err;
      const delay = 100 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** Create a test DB with the legacy schema (includes dead columns for migration testing) */
export function createLegacyTestDb(): TestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinventory-legacy-"));
  const dbPath = path.join(dir, "inventory-monitor.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  // Create tables with the old dead columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        location_id TEXT,
        supplier_id TEXT,
        unit_of_measure TEXT NOT NULL,
        min_quantity INTEGER,
        description TEXT,
        cost_per_unit REAL,
        reorder_quantity INTEGER NOT NULL,
        current_quantity INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(location_id) REFERENCES locations(id),
        FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        movement_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        reason TEXT,
        reference_no TEXT,
        notes TEXT,
        performed_by TEXT,
        performed_at TEXT NOT NULL,
        FOREIGN KEY(item_id) REFERENCES inventory_items(id)
    );

    CREATE TABLE IF NOT EXISTS low_stock_alerts (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        threshold_quantity INTEGER NOT NULL,
        quantity_at_trigger INTEGER NOT NULL,
        status TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        resolved_at TEXT,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        channel_summary TEXT,
        FOREIGN KEY(item_id) REFERENCES inventory_items(id)
    );

    CREATE TABLE IF NOT EXISTS personnel (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        details TEXT,
        performed_by TEXT,
        created_at TEXT NOT NULL
    );
  `);

  db.exec(MIGRATIONS_TABLE);

  return {
    db,
    dir,
    dbPath,
    cleanup: async () => {
      if (db.open) db.close();
      await tryRemoveDir(dir);
    },
  };
}

// ─── Helpers for seeding test data ───────────────────────────────────────────

let counter = 1;
function genId(prefix: string): string {
  return `${prefix}-test-${Date.now()}-${counter++}`;
}

export function seedItem(
  db: Database.Database,
  overrides: Partial<{
    id: string;
    sku: string;
    name: string;
    category: string;
    locationId: string | null;
    supplierId: string | null;
    unit: string;
    reorderQuantity: number;
    currentQuantity: number;
    status: string;
  }> = {},
): string {
  const id = overrides.id ?? genId("item");
  const sku = overrides.sku ?? `SKU-${id}`;
  const currentQty = overrides.currentQuantity ?? 100;
  const reorderQty = overrides.reorderQuantity ?? 10;
  const status =
    overrides.status ?? stockStatusKey(currentQty, reorderQty);

  db.prepare(
    `INSERT INTO inventory_items
     (id, sku, barcode, name, category, location_id, supplier_id, unit_of_measure,
      reorder_quantity, current_quantity, status, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
  ).run(
    id,
    sku,
    overrides.name ?? "Test Item",
    overrides.category ?? "General",
    overrides.locationId ?? null,
    overrides.supplierId ?? null,
    overrides.unit ?? "pcs",
    reorderQty,
    currentQty,
    status,
  );

  return id;
}

export function seedSupplier(
  db: Database.Database,
  name: string = "Test Supplier",
): string {
  const id = genId("supplier");
  db.prepare(
    `INSERT INTO suppliers (id, name, created_at, updated_at)
     VALUES (?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
  ).run(id, name);
  return id;
}

export function seedLocation(
  db: Database.Database,
  name: string = "Warehouse A",
): string {
  const id = genId("location");
  const code = `LOC-${id}`.toUpperCase();
  db.prepare(
    `INSERT INTO locations (id, name, code, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
  ).run(id, name, code);
  return id;
}

export function seedPersonnel(
  db: Database.Database,
  name: string = "John Doe",
): string {
  const id = genId("person");
  db.prepare(
    `INSERT INTO personnel (id, name, created_at, updated_at)
     VALUES (?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
  ).run(id, name);
  return id;
}

export function seedMovement(
  db: Database.Database,
  itemId: string,
  opts: Partial<{
    type: string;
    quantity: number;
    previousQty: number;
    newQty: number;
    reason: string | null;
    referenceNo: string | null;
    notes: string | null;
    performedBy: string | null;
    performedAt: string;
  }> = {},
): string {
  const id = genId("move");
  db.prepare(
    `INSERT INTO inventory_movements
     (id, item_id, movement_type, quantity, previous_quantity, new_quantity,
      reason, reference_no, notes, performed_by, performed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    itemId,
    opts.type ?? "receive",
    opts.quantity ?? 10,
    opts.previousQty ?? 0,
    opts.newQty ?? 10,
    opts.reason ?? null,
    opts.referenceNo ?? null,
    opts.notes ?? null,
    opts.performedBy ?? null,
    opts.performedAt ?? new Date().toISOString().replace("T", " ").slice(0, 19),
  );
  return id;
}

export function seedAlert(
  db: Database.Database,
  itemId: string,
  opts: Partial<{
    threshold: number;
    quantityAtTrigger: number;
    status: string;
    triggeredAt: string;
  }> = {},
): string {
  const id = genId("alert");
  db.prepare(
    `INSERT INTO low_stock_alerts
     (id, item_id, threshold_quantity, quantity_at_trigger, status,
      triggered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    itemId,
    opts.threshold ?? 10,
    opts.quantityAtTrigger ?? 5,
    opts.status ?? "open",
    opts.triggeredAt ?? new Date().toISOString().replace("T", " ").slice(0, 19),
  );
  return id;
}

export function writeSetting(
  db: Database.Database,
  key: string,
  value: string,
): void {
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function readSetting(
  db: Database.Database,
  key: string,
): string | undefined {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function stockStatusKey(
  currentQuantity: number,
  reorderQuantity: number,
): string {
  if (currentQuantity <= 0) return "out_of_stock";
  if (currentQuantity <= reorderQuantity) return "low_stock";
  return "in_stock";
}
