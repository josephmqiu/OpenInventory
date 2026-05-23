/**
 * Pre-generate seed databases for E2E tests.
 *
 * Must run BEFORE electron-rebuild (better-sqlite3 needs Node ABI).
 * Outputs .db files to e2e/.seed-cache/ which the Playwright fixture
 * copies into each project's temp dir before launching Electron.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runPendingMigrations } from "../../src/main/infrastructure/migrations";
import { configureSqlitePragmas } from "../../src/main/infrastructure/sqlite-pragmas";
import { LAN_SCENARIOS } from "../fixtures/lan-constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_SQL = fs.readFileSync(
  path.join(__dirname, "../../src/main/infrastructure/schema.sql"),
  "utf-8",
);

const SEED_CACHE = path.join(__dirname, "../.seed-cache");

// ─── Helpers (deterministic IDs, mirrors test/setup/test-db.ts logic) ────────

function createFreshDb(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  configureSqlitePragmas(db);
  db.exec(SCHEMA_SQL);
  runPendingMigrations(db);
  return db;
}

function insertItem(
  db: Database.Database,
  id: string,
  sku: string,
  name: string,
  opts: {
    category?: string;
    unit?: string;
    reorderQty?: number;
    currentQty?: number;
    status?: string;
    priceMinor?: number | null;
  } = {},
): void {
  const currentQty = opts.currentQty ?? 100;
  const reorderQty = opts.reorderQty ?? 10;
  const status = opts.status ?? (currentQty <= 0 ? "out_of_stock" : currentQty <= reorderQty ? "low_stock" : "in_stock");
  db.prepare(
    `INSERT INTO inventory_items
     (id, sku, barcode, name, category, location_id, supplier_id, unit_of_measure,
      reorder_quantity, current_quantity, status, unit_price_minor, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
  ).run(id, sku, name, opts.category ?? "Raw Material", opts.unit ?? "pcs", reorderQty, currentQty, status, opts.priceMinor ?? null);
}

function insertPersonnel(db: Database.Database, id: string, name: string): void {
  db.prepare(
    `INSERT INTO personnel (id, name, created_at, updated_at)
     VALUES (?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
  ).run(id, name);
}

function insertMovement(
  db: Database.Database,
  id: string,
  itemId: string,
  opts: {
    type?: string;
    quantity?: number;
    previousQty?: number;
    newQty?: number;
    reason?: string | null;
    performedBy?: string | null;
    performedAt?: string;
  } = {},
): void {
  db.prepare(
    `INSERT INTO inventory_movements
     (id, item_id, movement_type, quantity, previous_quantity, new_quantity,
      reason, reference_no, notes, performed_by, performed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    id,
    itemId,
    opts.type ?? "receive",
    opts.quantity ?? 10,
    opts.previousQty ?? 0,
    opts.newQty ?? 10,
    opts.reason ?? null,
    opts.performedBy ?? null,
    opts.performedAt ?? new Date().toISOString().replace("T", " ").slice(0, 19),
  );
}

function insertAlert(
  db: Database.Database,
  id: string,
  itemId: string,
  opts: { threshold?: number; quantityAtTrigger?: number; status?: string; triggeredAt?: string } = {},
): void {
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
}

function writeSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

// ─── Seed: empty ─────────────────────────────────────────────────────────────

function seedEmpty(dbPath: string): void {
  const db = createFreshDb(dbPath);
  db.close();
}

// ─── Seed: inventory-basics ──────────────────────────────────────────────────

function seedInventoryBasics(dbPath: string): void {
  const db = createFreshDb(dbPath);

  insertItem(db, "item-bolts", "SKU-BOLTS-M6", "Bolts M6", { currentQty: 100, reorderQty: 20 });
  insertItem(db, "item-washers", "SKU-WASHERS-M6", "Washers M6", { currentQty: 8, reorderQty: 10 });
  insertItem(db, "item-nuts", "SKU-NUTS-M6", "Nuts M6", { currentQty: 0, reorderQty: 5 });

  insertPersonnel(db, "person-alice", "Alice");
  insertPersonnel(db, "person-bob", "Bob");

  db.close();
}

// ─── Seed: audit-history ─────────────────────────────────────────────────────

function seedAuditHistory(dbPath: string): void {
  const db = createFreshDb(dbPath);

  // Same items and personnel as inventory-basics
  insertItem(db, "item-bolts", "SKU-BOLTS-M6", "Bolts M6", { currentQty: 100, reorderQty: 20 });
  insertItem(db, "item-washers", "SKU-WASHERS-M6", "Washers M6", { currentQty: 8, reorderQty: 10 });
  insertItem(db, "item-nuts", "SKU-NUTS-M6", "Nuts M6", { currentQty: 0, reorderQty: 5 });
  insertPersonnel(db, "person-alice", "Alice");
  insertPersonnel(db, "person-bob", "Bob");

  // 55 movements across items with varied dates, personnel, and types
  // This exceeds the default pageSize of 50 for pagination testing
  const items = ["item-bolts", "item-washers", "item-nuts"];
  const people = ["Alice", "Bob"];
  const types = ["receive", "issue"];
  const reasons = ["Production run", "Supplier delivery", "Floor request", "Quality check", "Restock"];
  const now = new Date();

  for (let i = 0; i < 55; i++) {
    const itemId = items[i % items.length];
    const type = types[i % types.length];
    const person = people[i % people.length];
    const reason = reasons[i % reasons.length];

    // Spread dates across the last 30 days
    const daysAgo = Math.floor((i / 55) * 30);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().replace("T", " ").slice(0, 19);

    insertMovement(db, `move-${i}`, itemId, {
      type,
      quantity: 5 + (i % 10),
      previousQty: 50,
      newQty: type === "receive" ? 55 + (i % 10) : 45 - (i % 10),
      reason,
      performedBy: person,
      performedAt: dateStr,
    });
  }

  // 2 open alerts
  insertAlert(db, "alert-washers", "item-washers", { threshold: 10, quantityAtTrigger: 8 });
  insertAlert(db, "alert-nuts", "item-nuts", { threshold: 5, quantityAtTrigger: 0 });

  db.close();
}

// ─── Seed: LAN-ready variants ────────────────────────────────────────────────

function seedLanFixture(
  dbPath: string,
  opts: { port: number; accessKey: string; includePersonnel?: boolean },
): void {
  const db = createFreshDb(dbPath);

  // Same items and personnel as inventory-basics
  insertItem(db, "item-bolts", "SKU-BOLTS-M6", "Bolts M6", { currentQty: 100, reorderQty: 20 });
  insertItem(db, "item-washers", "SKU-WASHERS-M6", "Washers M6", { currentQty: 8, reorderQty: 10 });
  insertItem(db, "item-nuts", "SKU-NUTS-M6", "Nuts M6", { currentQty: 0, reorderQty: 5 });
  if (opts.includePersonnel !== false) {
    insertPersonnel(db, "person-alice", "Alice");
    insertPersonnel(db, "person-bob", "Bob");
  }

  // LAN access settings — the app will start the server on boot
  writeSetting(db, "lan.enabled", "true");
  writeSetting(db, "lan.port", String(opts.port));
  writeSetting(db, "lan.access_key", opts.accessKey);

  db.close();
}

function seedLanAccess(dbPath: string): void {
  seedLanFixture(dbPath, LAN_SCENARIOS["lan-access"]);
}

function seedLanMobile(dbPath: string): void {
  seedLanFixture(dbPath, LAN_SCENARIOS["lan-mobile"]);
}

function seedLanQr(dbPath: string): void {
  seedLanFixture(dbPath, LAN_SCENARIOS["lan-qr"]);
}

function seedLanWarning(dbPath: string): void {
  seedLanFixture(dbPath, LAN_SCENARIOS["lan-warning"]);
}

// ─── Seed: no-personnel-lan ──────────────────────────────────────────────────

function seedNoPersonnelLan(dbPath: string): void {
  seedLanFixture(dbPath, {
    ...LAN_SCENARIOS["no-personnel-lan"],
    includePersonnel: false,
  });
}

// ─── Seed: pricing ───────────────────────────────────────────────────────────
//
// App currency CNY (¥, 2-decimal). Items have distinct prices plus one null-price
// item so the price-column sort can be asserted in both directions (null sorts as
// -1: first ascending, last descending). The pricing spec reads these for the
// sort/details/currency tests and creates its OWN throwaway item for the
// create→modify→clear arc, so a create failure can't corrupt the read tests.

function seedPricing(dbPath: string): void {
  const db = createFreshDb(dbPath);

  insertItem(db, "item-bolts", "SKU-BOLTS-M6", "Bolts M6", { currentQty: 100, reorderQty: 20, priceMinor: 1250 }); // ¥12.50
  insertItem(db, "item-nuts", "SKU-NUTS-M6", "Nuts M6", { currentQty: 50, reorderQty: 10, priceMinor: 599 }); // ¥5.99
  insertItem(db, "item-washers", "SKU-WASHERS-M6", "Washers M6", { currentQty: 30, reorderQty: 10, priceMinor: 8800 }); // ¥88.00
  insertItem(db, "item-gizmo", "SKU-GIZMO", "Gizmo", { currentQty: 40, reorderQty: 10, priceMinor: null }); // no price

  insertPersonnel(db, "person-alice", "Alice");
  insertPersonnel(db, "person-bob", "Bob");

  writeSetting(db, "app.currency", "CNY");
  // Pin the language so Intl currency formatting is deterministic in assertions.
  writeSetting(db, "app.language", "en");

  db.close();
}

// ─── Seed: backup-overdue ────────────────────────────────────────────────────

function seedBackupOverdue(dbPath: string): void {
  const db = createFreshDb(dbPath);

  insertItem(db, "item-bolts", "SKU-BOLTS-M6", "Bolts M6", { currentQty: 100, reorderQty: 20 });
  insertPersonnel(db, "person-alice", "Alice");
  insertPersonnel(db, "person-bob", "Bob");

  writeSetting(db, "backup.target_path", "/tmp/oi-e2e-backup-overdue");
  writeSetting(db, "backup.interval_value", "4");
  writeSetting(db, "backup.interval_unit", "hours");
  writeSetting(db, "backup.on_startup", "false");
  writeSetting(db, "backup.last_successful", new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());
  writeSetting(db, "backup.last_file_size", "4096");
  writeSetting(db, "backup.last_verified", "true");
  writeSetting(db, "backup.status", "healthy");

  db.close();
}

// ─── Seed: backup-error ──────────────────────────────────────────────────────

function seedBackupError(dbPath: string): void {
  const db = createFreshDb(dbPath);

  insertItem(db, "item-bolts", "SKU-BOLTS-M6", "Bolts M6", { currentQty: 100, reorderQty: 20 });
  insertPersonnel(db, "person-alice", "Alice");

  writeSetting(db, "backup.target_path", "/tmp/oi-e2e-backup-error");
  writeSetting(db, "backup.interval_value", "8");
  writeSetting(db, "backup.interval_unit", "hours");
  writeSetting(db, "backup.on_startup", "false");
  writeSetting(db, "backup.last_error", "Backup operation failed.");
  writeSetting(db, "backup.status", "error");

  db.close();
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  // Clean and recreate cache directory
  if (fs.existsSync(SEED_CACHE)) {
    fs.rmSync(SEED_CACHE, { recursive: true, force: true });
  }
  fs.mkdirSync(SEED_CACHE, { recursive: true });

  const scenarios: Record<string, (dbPath: string) => void> = {
    empty: seedEmpty,
    "inventory-basics": seedInventoryBasics,
    "audit-history": seedAuditHistory,
    "lan-access": seedLanAccess,
    "lan-mobile": seedLanMobile,
    "lan-qr": seedLanQr,
    "lan-warning": seedLanWarning,
    "no-personnel-lan": seedNoPersonnelLan,
    "backup-overdue": seedBackupOverdue,
    "backup-error": seedBackupError,
    pricing: seedPricing,
  };

  for (const [name, seed] of Object.entries(scenarios)) {
    const dbPath = path.join(SEED_CACHE, `${name}.db`);
    seed(dbPath);
    const size = fs.statSync(dbPath).size;
    console.log(`  seed: ${name} → ${dbPath} (${(size / 1024).toFixed(1)} KB)`);
  }

  console.log(`\n  ${Object.keys(scenarios).length} seed databases generated.\n`);
}

main();
