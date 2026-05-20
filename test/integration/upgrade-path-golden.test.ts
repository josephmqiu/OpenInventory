/**
 * Golden upgrade-path tests.
 *
 * These tests model prior released database shapes and assert that production
 * migrations preserve business data, not just table structure.
 */
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  currentVersion,
  LATEST_MIGRATION_VERSION,
  runPendingMigrations,
} from "../../src/main/infrastructure/migrations";
import {
  createLegacyTestDb,
  readSetting,
  seedAlert,
  seedItem,
  seedMovement,
  seedPersonnel,
  writeSetting,
  type TestDb,
} from "../setup/test-db";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

function netMovementTotal(db: Database.Database, itemId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(
        CASE movement_type
          WHEN 'receive' THEN quantity
          WHEN 'issue' THEN -quantity
          ELSE 0
        END
      ), 0) as total
      FROM inventory_movements
      WHERE item_id = ?`,
    )
    .get(itemId) as { total: number };
  return row.total;
}

describe("golden upgrade path", () => {
  it("upgrades a v5-style production database without corrupting balances or settings", () => {
    const t: TestDb = createLegacyTestDb();
    cleanups.push(t.cleanup);

    const itemId = seedItem(t.db, {
      sku: "GOLDEN-001",
      name: "Golden Valve",
      currentQuantity: 120,
      reorderQuantity: 20,
    });
    seedPersonnel(t.db, "Alice");
    seedMovement(t.db, itemId, {
      type: "receive",
      quantity: 200,
      previousQty: 0,
      newQty: 200,
      performedBy: "Alice",
    });
    seedMovement(t.db, itemId, {
      type: "issue",
      quantity: 80,
      previousQty: 200,
      newQty: 120,
      performedBy: "Alice",
    });
    seedAlert(t.db, itemId, {
      status: "open",
      threshold: 20,
      quantityAtTrigger: 12,
    });
    writeSetting(t.db, "backup.schedule", "daily");
    writeSetting(t.db, "backup.retention", "7 days");
    writeSetting(t.db, "app.language", "zh-CN");

    runPendingMigrations(t.db);

    expect(currentVersion(t.db)).toBe(LATEST_MIGRATION_VERSION);
    expect(
      (t.db.prepare("PRAGMA integrity_check(1)").get() as { integrity_check: string }).integrity_check,
    ).toBe("ok");
    expect(t.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const item = t.db
      .prepare(
        `SELECT current_quantity, reorder_quantity
         FROM inventory_items
         WHERE id = ?`,
      )
      .get(itemId) as {
      current_quantity: number;
      reorder_quantity: number;
    };
    expect(item.current_quantity).toBe(120);
    expect(item.reorder_quantity).toBe(20);
    expect(netMovementTotal(t.db, itemId)).toBe(120);

    const counts = {
      items: (t.db.prepare("SELECT COUNT(*) as count FROM inventory_items").get() as { count: number }).count,
      movements: (t.db.prepare("SELECT COUNT(*) as count FROM inventory_movements").get() as { count: number }).count,
      alerts: (t.db.prepare("SELECT COUNT(*) as count FROM low_stock_alerts").get() as { count: number }).count,
      personnel: (t.db.prepare("SELECT COUNT(*) as count FROM personnel").get() as { count: number }).count,
    };
    expect(counts).toEqual({
      items: 1,
      movements: 2,
      alerts: 1,
      personnel: 1,
    });

    expect(readSetting(t.db, "backup.interval_value")).toBe("1");
    expect(readSetting(t.db, "backup.interval_unit")).toBe("days");
    expect(readSetting(t.db, "backup.on_startup")).toBe("false");
    expect(readSetting(t.db, "backup.schedule")).toBeUndefined();
    expect(readSetting(t.db, "backup.retention")).toBeUndefined();
    expect(readSetting(t.db, "app.language")).toBe("zh-CN");
  });
});
