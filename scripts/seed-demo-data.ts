/**
 * Seed the app database with realistic warehouse demo data.
 *
 * Usage:  npx tsx scripts/seed-demo-data.ts
 *
 * Creates: 20 workers, 8 suppliers, 6 locations, ~50 items,
 *          ~6000 movements over 1 year, and natural low-stock alerts.
 */

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import readline from "readline";

// ── DB path ────────────────────────────────────────────────────────────────

// In dev mode Electron uses the package.json "name" field as the userData folder.
// Detect the correct path by checking which folder exists.
const CANDIDATES = [
  path.join(os.homedir(), "Library", "Application Support", "inventory-monitor", "data"),
  path.join(os.homedir(), "Library", "Application Support", "OpenInventory", "data"),
  path.join(os.homedir(), "Library", "Application Support", "com.local.inventory-monitor", "data"),
];
const DATA_DIR = CANDIDATES.find((d) => fs.existsSync(path.join(d, "inventory-monitor.db")))
  ?? CANDIDATES[0];
const DB_PATH = path.join(DATA_DIR, "inventory-monitor.db");

// ── ID generation (matches app convention) ─────────────────────────────────

let seq = 0;
function genId(prefix: string): string {
  seq++;
  const ts = Date.now() * 1000 + seq;
  return `${prefix}-${ts}-${seq}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fmtDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function stockStatus(qty: number, reorder: number): string {
  if (qty <= 0) return "out_of_stock";
  if (qty <= reorder) return "low_stock";
  return "in_stock";
}

// ── Static data ────────────────────────────────────────────────────────────

const PERSONNEL_NAMES = [
  "Marcus Chen",
  "Priya Sharma",
  "Jake Williams",
  "Sofia Rodriguez",
  "David Kim",
  "Aisha Patel",
  "Tyler Johnson",
  "Maria Santos",
  "Liam O'Brien",
  "Fatima Al-Hassan",
  "Ryan Cooper",
  "Nkechi Okafor",
  "Carlos Gutierrez",
  "Emily Watson",
  "Hiroshi Tanaka",
  "Rachel Green",
  "Omar Diallo",
  "Jessica Liu",
  "Brandon Hayes",
  "Ananya Krishnan",
];

const SUPPLIER_NAMES = [
  "Acme Industrial Supply",
  "Pacific Hardware Co.",
  "Midwest Fasteners Inc.",
  "SafeGuard Equipment",
  "ElectroParts Direct",
  "GreenClean Solutions",
  "Atlas Packaging Corp.",
  "TrueGrade Materials",
];

const LOCATIONS = [
  { name: "Warehouse A", code: "LOC-WH-A" },
  { name: "Warehouse B", code: "LOC-WH-B" },
  { name: "Cold Storage", code: "LOC-COLD" },
  { name: "Receiving Dock", code: "LOC-RECV" },
  { name: "Staging Area", code: "LOC-STAGE" },
  { name: "Overflow", code: "LOC-OFLOW" },
];

interface ItemDef {
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorderQty: number;
  initialQty: number;
  turnover: "high" | "medium" | "low";
}

const ITEM_DEFS: ItemDef[] = [
  // Fasteners
  { sku: "FST-HEX-M8", name: "Hex Bolt M8x40", category: "Fasteners", unit: "pcs", reorderQty: 200, initialQty: 500, turnover: "high" },
  { sku: "FST-HEX-M10", name: "Hex Bolt M10x50", category: "Fasteners", unit: "pcs", reorderQty: 150, initialQty: 400, turnover: "high" },
  { sku: "FST-NUT-M8", name: "Hex Nut M8", category: "Fasteners", unit: "pcs", reorderQty: 300, initialQty: 800, turnover: "high" },
  { sku: "FST-WASH-M8", name: "Flat Washer M8", category: "Fasteners", unit: "pcs", reorderQty: 250, initialQty: 600, turnover: "medium" },
  { sku: "FST-SCREW-PH", name: "Phillips Screw #8x1\"", category: "Fasteners", unit: "pcs", reorderQty: 500, initialQty: 1200, turnover: "high" },
  { sku: "FST-ANCHOR-WDG", name: "Wedge Anchor 3/8\"", category: "Fasteners", unit: "pcs", reorderQty: 50, initialQty: 150, turnover: "low" },
  // Electrical
  { sku: "ELC-WIRE-14G", name: "14 AWG Wire (Red)", category: "Electrical", unit: "meters", reorderQty: 100, initialQty: 300, turnover: "medium" },
  { sku: "ELC-WIRE-12G", name: "12 AWG Wire (Black)", category: "Electrical", unit: "meters", reorderQty: 100, initialQty: 250, turnover: "medium" },
  { sku: "ELC-BRKR-20A", name: "Circuit Breaker 20A", category: "Electrical", unit: "pcs", reorderQty: 10, initialQty: 30, turnover: "low" },
  { sku: "ELC-OUTLET-STD", name: "Standard Outlet 120V", category: "Electrical", unit: "pcs", reorderQty: 20, initialQty: 60, turnover: "low" },
  { sku: "ELC-CONDUIT-1", name: "EMT Conduit 1\" x 10ft", category: "Electrical", unit: "pcs", reorderQty: 15, initialQty: 45, turnover: "low" },
  { sku: "ELC-TAPE-BLK", name: "Electrical Tape (Black)", category: "Electrical", unit: "rolls", reorderQty: 30, initialQty: 80, turnover: "medium" },
  // Safety
  { sku: "SAF-GLOVE-L", name: "Work Gloves (Large)", category: "Safety", unit: "pairs", reorderQty: 40, initialQty: 120, turnover: "high" },
  { sku: "SAF-GLOVE-M", name: "Work Gloves (Medium)", category: "Safety", unit: "pairs", reorderQty: 30, initialQty: 100, turnover: "high" },
  { sku: "SAF-GOGGLES", name: "Safety Goggles", category: "Safety", unit: "pcs", reorderQty: 20, initialQty: 60, turnover: "medium" },
  { sku: "SAF-HELMET-WH", name: "Hard Hat (White)", category: "Safety", unit: "pcs", reorderQty: 10, initialQty: 35, turnover: "low" },
  { sku: "SAF-VEST-HI", name: "Hi-Vis Safety Vest", category: "Safety", unit: "pcs", reorderQty: 15, initialQty: 50, turnover: "medium" },
  { sku: "SAF-EARPLUGS", name: "Foam Ear Plugs", category: "Safety", unit: "pairs", reorderQty: 100, initialQty: 300, turnover: "high" },
  { sku: "SAF-MASK-N95", name: "N95 Respirator Mask", category: "Safety", unit: "pcs", reorderQty: 50, initialQty: 200, turnover: "high" },
  // Tools
  { sku: "TLS-HAMMER-16", name: "Ball Peen Hammer 16oz", category: "Tools", unit: "pcs", reorderQty: 3, initialQty: 12, turnover: "low" },
  { sku: "TLS-WRENCH-SET", name: "Combination Wrench Set", category: "Tools", unit: "sets", reorderQty: 2, initialQty: 8, turnover: "low" },
  { sku: "TLS-DRILL-BIT", name: "HSS Drill Bit Set", category: "Tools", unit: "sets", reorderQty: 5, initialQty: 15, turnover: "low" },
  { sku: "TLS-TAPE-25", name: "Tape Measure 25ft", category: "Tools", unit: "pcs", reorderQty: 5, initialQty: 20, turnover: "low" },
  { sku: "TLS-LEVEL-24", name: "Spirit Level 24\"", category: "Tools", unit: "pcs", reorderQty: 2, initialQty: 8, turnover: "low" },
  { sku: "TLS-CUTWHEEL", name: "Cutting Wheel 4.5\"", category: "Tools", unit: "pcs", reorderQty: 20, initialQty: 50, turnover: "medium" },
  // Plumbing
  { sku: "PLB-PIPE-1CU", name: "Copper Pipe 1\" x 10ft", category: "Plumbing", unit: "pcs", reorderQty: 10, initialQty: 30, turnover: "low" },
  { sku: "PLB-ELBOW-1", name: "Copper Elbow 1\"", category: "Plumbing", unit: "pcs", reorderQty: 20, initialQty: 60, turnover: "medium" },
  { sku: "PLB-VALVE-BALL", name: "Ball Valve 1\"", category: "Plumbing", unit: "pcs", reorderQty: 5, initialQty: 20, turnover: "low" },
  { sku: "PLB-TAPE-PTFE", name: "PTFE Thread Tape", category: "Plumbing", unit: "rolls", reorderQty: 25, initialQty: 80, turnover: "medium" },
  { sku: "PLB-SOLDER", name: "Lead-Free Solder 1lb", category: "Plumbing", unit: "pcs", reorderQty: 5, initialQty: 15, turnover: "low" },
  // Packaging
  { sku: "PKG-BOX-SM", name: "Corrugated Box 12x12x12", category: "Packaging", unit: "pcs", reorderQty: 100, initialQty: 350, turnover: "high" },
  { sku: "PKG-BOX-LG", name: "Corrugated Box 24x18x18", category: "Packaging", unit: "pcs", reorderQty: 50, initialQty: 200, turnover: "medium" },
  { sku: "PKG-TAPE-CLR", name: "Packing Tape (Clear)", category: "Packaging", unit: "rolls", reorderQty: 30, initialQty: 100, turnover: "high" },
  { sku: "PKG-BUBBLE-LG", name: "Bubble Wrap Roll 24\"", category: "Packaging", unit: "rolls", reorderQty: 10, initialQty: 25, turnover: "medium" },
  { sku: "PKG-PALLET-48", name: "Wood Pallet 48x40", category: "Packaging", unit: "pcs", reorderQty: 15, initialQty: 40, turnover: "medium" },
  { sku: "PKG-STRETCH", name: "Stretch Wrap 18\"", category: "Packaging", unit: "rolls", reorderQty: 10, initialQty: 30, turnover: "medium" },
  // Cleaning
  { sku: "CLN-DEGREASER", name: "Industrial Degreaser 1gal", category: "Cleaning", unit: "bottles", reorderQty: 5, initialQty: 15, turnover: "medium" },
  { sku: "CLN-WIPES-HD", name: "Heavy-Duty Shop Wipes", category: "Cleaning", unit: "canisters", reorderQty: 10, initialQty: 30, turnover: "medium" },
  { sku: "CLN-BROOM-IND", name: "Industrial Push Broom 24\"", category: "Cleaning", unit: "pcs", reorderQty: 3, initialQty: 10, turnover: "low" },
  { sku: "CLN-ABSORBENT", name: "Oil Absorbent Pads", category: "Cleaning", unit: "pcs", reorderQty: 25, initialQty: 80, turnover: "medium" },
  { sku: "CLN-TRASH-55", name: "Trash Bags 55gal (box)", category: "Cleaning", unit: "boxes", reorderQty: 5, initialQty: 15, turnover: "medium" },
  // Raw Materials
  { sku: "RAW-STEEL-FLAT", name: "Flat Steel Bar 1\"x3\"x6ft", category: "Raw Materials", unit: "pcs", reorderQty: 10, initialQty: 25, turnover: "medium" },
  { sku: "RAW-STEEL-ANG", name: "Steel Angle 2\"x2\"x8ft", category: "Raw Materials", unit: "pcs", reorderQty: 8, initialQty: 20, turnover: "low" },
  { sku: "RAW-PLYWOOD", name: "Plywood Sheet 4x8 3/4\"", category: "Raw Materials", unit: "sheets", reorderQty: 5, initialQty: 15, turnover: "low" },
  { sku: "RAW-LUMBER-2X4", name: "Lumber 2x4x8ft", category: "Raw Materials", unit: "pcs", reorderQty: 20, initialQty: 50, turnover: "medium" },
  { sku: "RAW-CONCRETE", name: "Portland Cement 94lb bag", category: "Raw Materials", unit: "bags", reorderQty: 10, initialQty: 25, turnover: "low" },
  { sku: "RAW-SAND-50", name: "Play Sand 50lb bag", category: "Raw Materials", unit: "bags", reorderQty: 8, initialQty: 20, turnover: "low" },
  { sku: "RAW-ADHESIVE", name: "Construction Adhesive 10oz", category: "Raw Materials", unit: "tubes", reorderQty: 15, initialQty: 40, turnover: "medium" },
  { sku: "RAW-PAINT-WH", name: "Industrial Paint (White) 1gal", category: "Raw Materials", unit: "cans", reorderQty: 5, initialQty: 12, turnover: "low" },
];

const RECEIVE_REASONS = [
  "Scheduled delivery",
  "PO fulfillment",
  "Backorder arrival",
  "Emergency restock",
  "Quarterly replenishment",
  "Vendor consignment",
  "Return to stock",
];

const ISSUE_REASONS = [
  "Production line request",
  "Maintenance order",
  "Project allocation",
  "Floor replenishment",
  "Contractor issue",
  "Quality replacement",
  "Work order #" + "WO",
  "Repair job",
  "Assembly line",
  "Shift supplies",
];

// ── Confirmation prompt ────────────────────────────────────────────────────

async function confirm(msg: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${msg} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    console.error("Launch the app once first so the database is created, then re-run this script.");
    process.exit(1);
  }

  console.log(`Target database: ${DB_PATH}`);
  const ok = await confirm("This will CLEAR all existing data and insert demo data. Continue?");
  if (!ok) {
    console.log("Aborted.");
    process.exit(0);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // ── Clear existing data (order matters for FK constraints) ──────────────

  db.exec(`
    DELETE FROM low_stock_alerts;
    DELETE FROM inventory_movements;
    DELETE FROM inventory_items;
    DELETE FROM suppliers;
    DELETE FROM locations;
    DELETE FROM personnel;
  `);

  console.log("Cleared existing data.");

  // ── Insert personnel ──────────────────────────────────────────────────

  const personnelIds: string[] = [];
  const insertPerson = db.prepare(
    `INSERT INTO personnel (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  );
  const personnelCreated = fmtDate(new Date("2025-03-15"));
  for (const name of PERSONNEL_NAMES) {
    const id = genId("person");
    insertPerson.run(id, name, personnelCreated, personnelCreated);
    personnelIds.push(id);
  }
  console.log(`Inserted ${PERSONNEL_NAMES.length} personnel.`);

  // ── Insert suppliers ──────────────────────────────────────────────────

  const supplierIds: string[] = [];
  const insertSupplier = db.prepare(
    `INSERT INTO suppliers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  );
  const supplierCreated = fmtDate(new Date("2025-03-20"));
  for (const name of SUPPLIER_NAMES) {
    const id = genId("supplier");
    insertSupplier.run(id, name, supplierCreated, supplierCreated);
    supplierIds.push(id);
  }
  console.log(`Inserted ${SUPPLIER_NAMES.length} suppliers.`);

  // ── Insert locations ──────────────────────────────────────────────────

  const locationIds: string[] = [];
  const insertLocation = db.prepare(
    `INSERT INTO locations (id, name, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const locationCreated = fmtDate(new Date("2025-03-20"));
  for (const loc of LOCATIONS) {
    const id = genId("location");
    insertLocation.run(id, loc.name, loc.code, locationCreated, locationCreated);
    locationIds.push(id);
  }
  console.log(`Inserted ${LOCATIONS.length} locations.`);

  // ── Insert inventory items ────────────────────────────────────────────

  const insertItem = db.prepare(
    `INSERT INTO inventory_items
     (id, sku, barcode, name, category, location_id, supplier_id, unit_of_measure,
      reorder_quantity, current_quantity, status, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  interface LiveItem {
    id: string;
    def: ItemDef;
    qty: number;
  }

  const items: LiveItem[] = [];
  const itemCreated = fmtDate(new Date("2025-04-01"));

  for (const def of ITEM_DEFS) {
    const id = genId("item");
    const locationId = pick(locationIds);
    const supplierId = pick(supplierIds);
    insertItem.run(
      id,
      def.sku,
      def.name,
      def.category,
      locationId,
      supplierId,
      def.unit,
      def.reorderQty,
      def.initialQty,
      stockStatus(def.initialQty, def.reorderQty),
      itemCreated,
      itemCreated,
    );
    items.push({ id, def, qty: def.initialQty });
  }
  console.log(`Inserted ${ITEM_DEFS.length} inventory items.`);

  // ── Generate movements over 1 year ────────────────────────────────────

  const insertMovement = db.prepare(
    `INSERT INTO inventory_movements
     (id, item_id, movement_type, quantity, previous_quantity, new_quantity,
      reason, reference_no, notes, performed_by, performed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertAlert = db.prepare(
    `INSERT INTO low_stock_alerts
     (id, item_id, threshold_quantity, quantity_at_trigger, status,
      triggered_at, resolved_at, channel_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'desktop,in_app')`,
  );

  // Track open alerts per item so we can resolve them on restock
  const openAlerts = new Map<string, string>(); // itemId -> alertId
  let moveCount = 0;
  let alertCount = 0;

  const startDate = new Date("2025-04-02");
  const endDate = new Date("2026-04-01");
  const oneDay = 24 * 60 * 60 * 1000;

  // Assign workers role weights: first 6 are receivers, next 10 are issuers, last 4 do both
  const receivers = PERSONNEL_NAMES.slice(0, 6);
  const issuers = PERSONNEL_NAMES.slice(6, 16);
  const generalists = PERSONNEL_NAMES.slice(16, 20);

  const beginTx = db.prepare("BEGIN");
  const commitTx = db.prepare("COMMIT");

  beginTx.run();

  for (let d = startDate.getTime(); d <= endDate.getTime(); d += oneDay) {
    const date = new Date(d);
    const dow = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;

    // ── Receives: batches arrive on weekdays, occasionally weekends ──
    // Only restock items that are running low — simulates reactive purchasing

    if (!isWeekend || Math.random() < 0.1) {
      // Pick 2-5 random items to receive — simulates regular purchase orders
      const receiveCount = isWeekend ? randInt(0, 1) : randInt(2, 5);
      const shuffled = [...items].sort(() => Math.random() - 0.5);

      for (let i = 0; i < receiveCount && i < shuffled.length; i++) {
        const item = shuffled[i];
        // Restock quantities
        const baseQty =
          item.def.turnover === "high" ? randInt(25, 80) :
          item.def.turnover === "medium" ? randInt(10, 35) :
          randInt(3, 12);

        const prevQty = item.qty;
        item.qty += baseQty;

        const hour = randInt(6, 10);
        const min = randInt(0, 59);
        const ts = new Date(d);
        ts.setHours(hour, min, randInt(0, 59));

        const worker = pick([...receivers, ...generalists]);
        const reason = pick(RECEIVE_REASONS);
        const refNo = `PO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${randInt(1000, 9999)}`;

        insertMovement.run(
          genId("move"),
          item.id,
          "receive",
          baseQty,
          prevQty,
          item.qty,
          reason,
          refNo,
          null,
          worker,
          fmtDate(ts),
        );
        moveCount++;

        // Resolve open alert if stock is replenished above threshold
        if (openAlerts.has(item.id) && item.qty > item.def.reorderQty) {
          const alertId = openAlerts.get(item.id)!;
          db.prepare(
            `UPDATE low_stock_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?`,
          ).run(fmtDate(ts), alertId);
          openAlerts.delete(item.id);
        }
      }
    }

    // ── Issues: happen throughout the day on weekdays, less on weekends ──

    const issueCount = isWeekend ? randInt(1, 3) : randInt(6, 14);
    const issuePool = [...items].sort(() => Math.random() - 0.5);

    for (let i = 0; i < issueCount && i < issuePool.length; i++) {
      const item = issuePool[i];
      if (item.qty <= 0) continue; // can't issue from empty stock

      const maxIssue = Math.min(
        item.qty,
        item.def.turnover === "high" ? randInt(5, 25) :
        item.def.turnover === "medium" ? randInt(2, 12) :
        randInt(1, 5),
      );
      if (maxIssue <= 0) continue;

      const issueQty = randInt(1, maxIssue);
      const prevQty = item.qty;
      item.qty -= issueQty;

      const hour = randInt(7, 17);
      const min = randInt(0, 59);
      const ts = new Date(d);
      ts.setHours(hour, min, randInt(0, 59));

      const worker = pick([...issuers, ...generalists]);
      let reason = pick(ISSUE_REASONS);
      if (reason.endsWith("WO")) {
        reason = `Work order #WO-${randInt(10000, 99999)}`;
      }

      insertMovement.run(
        genId("move"),
        item.id,
        "issue",
        issueQty,
        prevQty,
        item.qty,
        reason,
        null,
        null,
        worker,
        fmtDate(ts),
      );
      moveCount++;

      // Trigger low-stock alert if quantity dropped below reorder threshold
      if (item.qty <= item.def.reorderQty && !openAlerts.has(item.id)) {
        const alertId = genId("alert");
        insertAlert.run(
          alertId,
          item.id,
          item.def.reorderQty,
          item.qty,
          "open",
          fmtDate(ts),
          null,
        );
        openAlerts.set(item.id, alertId);
        alertCount++;
      }
    }
  }

  // ── Post-simulation: create target distribution of statuses ────────────
  // Shuffle items and deliberately drain some to low/out-of-stock in recent days
  const sortedItems = [...items].sort(() => Math.random() - 0.5);
  const targetLow = Math.round(items.length * 0.25);   // ~25% low stock
  const targetOos = Math.round(items.length * 0.12);    // ~12% out of stock
  const recentDate = new Date("2026-03-28");

  // Make some items out-of-stock
  for (let i = 0; i < targetOos && i < sortedItems.length; i++) {
    const item = sortedItems[i];
    if (item.qty <= 0) continue;
    const drainQty = item.qty; // drain all remaining
    const prevQty = item.qty;
    item.qty = 0;
    const ts = new Date(recentDate.getTime() + randInt(0, 4) * oneDay);
    ts.setHours(randInt(8, 16), randInt(0, 59), randInt(0, 59));
    const worker = pick([...issuers, ...generalists]);
    insertMovement.run(
      genId("move"), item.id, "issue", drainQty, prevQty, 0,
      "High-priority project allocation", null, null, worker, fmtDate(ts),
    );
    moveCount++;
    if (!openAlerts.has(item.id)) {
      const alertId = genId("alert");
      insertAlert.run(alertId, item.id, item.def.reorderQty, 0, "open", fmtDate(ts), null);
      openAlerts.set(item.id, alertId);
      alertCount++;
    }
  }

  // Make some items low-stock
  for (let i = targetOos; i < targetOos + targetLow && i < sortedItems.length; i++) {
    const item = sortedItems[i];
    if (item.qty <= item.def.reorderQty) continue; // already low
    const targetQty = randInt(1, item.def.reorderQty);
    const drainQty = item.qty - targetQty;
    if (drainQty <= 0) continue;
    const prevQty = item.qty;
    item.qty = targetQty;
    const ts = new Date(recentDate.getTime() + randInt(0, 4) * oneDay);
    ts.setHours(randInt(8, 16), randInt(0, 59), randInt(0, 59));
    const worker = pick([...issuers, ...generalists]);
    insertMovement.run(
      genId("move"), item.id, "issue", drainQty, prevQty, targetQty,
      "Bulk order fulfillment", null, null, worker, fmtDate(ts),
    );
    moveCount++;
    if (!openAlerts.has(item.id)) {
      const alertId = genId("alert");
      insertAlert.run(alertId, item.id, item.def.reorderQty, targetQty, "open", fmtDate(ts), null);
      openAlerts.set(item.id, alertId);
      alertCount++;
    }
  }

  commitTx.run();

  console.log(`Inserted ${moveCount} inventory movements.`);
  console.log(`Generated ${alertCount} low-stock alerts.`);

  // ── Update final item quantities and statuses ─────────────────────────

  const updateItem = db.prepare(
    `UPDATE inventory_items SET current_quantity = ?, status = ?, updated_at = ? WHERE id = ?`,
  );
  const now = fmtDate(new Date());
  let inStock = 0, lowStock = 0, outOfStock = 0;

  for (const item of items) {
    const status = stockStatus(item.qty, item.def.reorderQty);
    updateItem.run(item.qty, status, now, item.id);
    if (status === "in_stock") inStock++;
    else if (status === "low_stock") lowStock++;
    else outOfStock++;
  }

  console.log("\n── Summary ─────────────────────────────────────────");
  console.log(`Personnel:  ${PERSONNEL_NAMES.length}`);
  console.log(`Suppliers:  ${SUPPLIER_NAMES.length}`);
  console.log(`Locations:  ${LOCATIONS.length}`);
  console.log(`Items:      ${ITEM_DEFS.length}  (${inStock} in-stock, ${lowStock} low-stock, ${outOfStock} out-of-stock)`);
  console.log(`Movements:  ${moveCount}`);
  console.log(`Alerts:     ${alertCount}  (${openAlerts.size} still open)`);
  console.log("────────────────────────────────────────────────────");
  console.log("Done! Launch the app to review.");

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
