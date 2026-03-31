import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import { makeDatabaseService } from "../../src/main/services/DatabaseService";
import { runPendingMigrations } from "../../src/main/infrastructure/migrations";
import {
  createTestDb,
  seedItem,
  seedMovement,
  seedPersonnel,
  seedAlert,
  type TestDb,
} from "../setup/test-db";

let testDb: TestDb;
let db: ReturnType<typeof makeDatabaseService>;

beforeEach(() => {
  testDb = createTestDb();
  runPendingMigrations(testDb.db);
  db = makeDatabaseService(testDb.dbPath);
});

afterEach(() => {
  db.close();
  testDb.cleanup();
});

const run = <A>(effect: Effect.Effect<A, unknown>): A => Effect.runSync(effect);

describe("getAuditMovements", () => {
  it("returns correct rows with no filters", () => {
    const itemId = seedItem(testDb.db, { name: "Widget A" });
    seedMovement(testDb.db, itemId, { type: "receive", quantity: 50, performedBy: "Alice" });
    seedMovement(testDb.db, itemId, { type: "issue", quantity: 10, performedBy: "Bob" });

    const result = run(db.getAuditMovements({ page: 1, pageSize: 50 }));
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.rows[0].itemName).toBe("Widget A");
  });

  it("respects date range filter", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { performedAt: "2026-01-01 10:00:00" });
    seedMovement(testDb.db, itemId, { performedAt: "2026-03-15 10:00:00" });
    seedMovement(testDb.db, itemId, { performedAt: "2026-06-01 10:00:00" });

    const result = run(db.getAuditMovements({
      dateFrom: "2026-02-01 00:00:00",
      dateTo: "2026-04-01 23:59:59",
      page: 1,
      pageSize: 50,
    }));
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("respects movement type filter", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { type: "receive" });
    seedMovement(testDb.db, itemId, { type: "issue" });
    seedMovement(testDb.db, itemId, { type: "receive" });

    const result = run(db.getAuditMovements({
      movementType: "issue",
      page: 1,
      pageSize: 50,
    }));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].movementType).toBe("issue");
  });

  it("respects item search (name and SKU partial match)", () => {
    const itemA = seedItem(testDb.db, { name: "Alpha Widget", sku: "SKU-ALPHA" });
    const itemB = seedItem(testDb.db, { name: "Beta Gear", sku: "SKU-BETA" });
    seedMovement(testDb.db, itemA);
    seedMovement(testDb.db, itemB);

    const byName = run(db.getAuditMovements({ itemSearch: "Alpha", page: 1, pageSize: 50 }));
    expect(byName.rows).toHaveLength(1);
    expect(byName.rows[0].itemName).toBe("Alpha Widget");

    const bySku = run(db.getAuditMovements({ itemSearch: "BETA", page: 1, pageSize: 50 }));
    expect(bySku.rows).toHaveLength(1);
    expect(bySku.rows[0].itemSku).toBe("SKU-BETA");
  });

  it("respects personnel filter", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { performedBy: "Alice" });
    seedMovement(testDb.db, itemId, { performedBy: "Bob" });

    const result = run(db.getAuditMovements({ performedBy: "Alice", page: 1, pageSize: 50 }));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].performedBy).toBe("Alice");
  });

  it("respects text search across reason/reference/notes/performedBy", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { reason: "Project ABC" });
    seedMovement(testDb.db, itemId, { referenceNo: "PO-12345" });
    seedMovement(testDb.db, itemId, { notes: "urgent delivery" });
    seedMovement(testDb.db, itemId, { performedBy: "SearchableUser" });
    seedMovement(testDb.db, itemId, { reason: "unrelated" });

    const byReason = run(db.getAuditMovements({ textSearch: "ABC", page: 1, pageSize: 50 }));
    expect(byReason.rows).toHaveLength(1);

    const byRef = run(db.getAuditMovements({ textSearch: "PO-12345", page: 1, pageSize: 50 }));
    expect(byRef.rows).toHaveLength(1);

    const byNotes = run(db.getAuditMovements({ textSearch: "urgent", page: 1, pageSize: 50 }));
    expect(byNotes.rows).toHaveLength(1);

    const byPerson = run(db.getAuditMovements({ textSearch: "SearchableUser", page: 1, pageSize: 50 }));
    expect(byPerson.rows).toHaveLength(1);
  });

  it("pagination works correctly", () => {
    const itemId = seedItem(testDb.db);
    for (let i = 0; i < 5; i++) {
      seedMovement(testDb.db, itemId, { performedAt: `2026-03-${String(10 + i).padStart(2, "0")} 10:00:00` });
    }

    const page1 = run(db.getAuditMovements({ page: 1, pageSize: 2 }));
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = run(db.getAuditMovements({ page: 2, pageSize: 2 }));
    expect(page2.rows).toHaveLength(2);

    const page3 = run(db.getAuditMovements({ page: 3, pageSize: 2 }));
    expect(page3.rows).toHaveLength(1);
  });

  it("summary aggregation matches row data", () => {
    const itemA = seedItem(testDb.db);
    const itemB = seedItem(testDb.db);
    seedMovement(testDb.db, itemA, { type: "receive", quantity: 100, performedBy: "Alice" });
    seedMovement(testDb.db, itemA, { type: "issue", quantity: 30, performedBy: "Bob" });
    seedMovement(testDb.db, itemB, { type: "receive", quantity: 50, performedBy: "Alice" });

    const result = run(db.getAuditMovements({ page: 1, pageSize: 50 }));
    expect(result.summary.totalMovements).toBe(3);
    expect(result.summary.totalReceived).toBe(150);
    expect(result.summary.totalIssued).toBe(30);
    expect(result.summary.uniqueItems).toBe(2);
    expect(result.summary.uniquePersonnel).toBe(2);
  });

  it("combined filters work together", () => {
    const itemId = seedItem(testDb.db, { name: "TargetItem" });
    const otherId = seedItem(testDb.db, { name: "OtherItem" });
    seedMovement(testDb.db, itemId, { type: "receive", performedBy: "Alice", performedAt: "2026-03-15 10:00:00" });
    seedMovement(testDb.db, itemId, { type: "issue", performedBy: "Bob", performedAt: "2026-03-15 11:00:00" });
    seedMovement(testDb.db, otherId, { type: "receive", performedBy: "Alice", performedAt: "2026-03-15 12:00:00" });

    const result = run(db.getAuditMovements({
      itemSearch: "Target",
      performedBy: "Alice",
      dateFrom: "2026-03-01 00:00:00",
      dateTo: "2026-03-31 23:59:59",
      page: 1,
      pageSize: 50,
    }));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].performedBy).toBe("Alice");
    expect(result.rows[0].itemName).toBe("TargetItem");
  });

  it("empty result set returns zeros", () => {
    const result = run(db.getAuditMovements({ page: 1, pageSize: 50 }));
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.summary.totalMovements).toBe(0);
    expect(result.summary.totalReceived).toBe(0);
    expect(result.summary.totalIssued).toBe(0);
    expect(result.summary.uniqueItems).toBe(0);
    expect(result.summary.uniquePersonnel).toBe(0);
  });

  it("page beyond last page returns empty rows with correct total", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId);

    const result = run(db.getAuditMovements({ page: 999, pageSize: 50 }));
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(1);
  });

  it("itemId filter returns exact match for drill-down", () => {
    const itemA = seedItem(testDb.db, { name: "Item A" });
    const itemB = seedItem(testDb.db, { name: "Item B" });
    seedMovement(testDb.db, itemA);
    seedMovement(testDb.db, itemB);

    const result = run(db.getAuditMovements({ itemId: itemA, page: 1, pageSize: 50 }));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].itemId).toBe(itemA);
  });

  it("LIKE search with SQL special characters does not break query", () => {
    const itemId = seedItem(testDb.db, { name: "100% Pure" });
    seedMovement(testDb.db, itemId, { reason: "test_reason" });

    const byPercent = run(db.getAuditMovements({ itemSearch: "100%", page: 1, pageSize: 50 }));
    expect(byPercent.rows).toHaveLength(1);

    const byUnderscore = run(db.getAuditMovements({ textSearch: "test_reason", page: 1, pageSize: 50 }));
    expect(byUnderscore.rows).toHaveLength(1);
  });

  it("response includes all audit fields including referenceNo and notes", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, {
      reason: "Project X",
      referenceNo: "PO-999",
      notes: "Expedited",
      performedBy: "Alice",
    });

    const result = run(db.getAuditMovements({ page: 1, pageSize: 50 }));
    const row = result.rows[0];
    expect(row.reason).toBe("Project X");
    expect(row.referenceNo).toBe("PO-999");
    expect(row.notes).toBe("Expedited");
    expect(row.performedBy).toBe("Alice");
    expect(typeof row.previousQuantity).toBe("number");
    expect(typeof row.newQuantity).toBe("number");
    expect(typeof row.isAnomaly).toBe("boolean");
  });

  it("anomaly detection flags rows with quantity >= 5x average", () => {
    const itemId = seedItem(testDb.db);
    // Seed 10 normal movements (quantity 10 each)
    // With the anomaly row (500), avg = (100 + 500) / 11 = 54.5
    // 500 >= 54.5 * 5 = 272.7 → true (anomaly)
    // 10 >= 54.5 * 5 = 272.7 → false (normal)
    for (let i = 0; i < 10; i++) {
      seedMovement(testDb.db, itemId, { quantity: 10, performedAt: `2026-03-${String(10 + i).padStart(2, "0")} 10:00:00` });
    }
    seedMovement(testDb.db, itemId, { quantity: 500, performedAt: "2026-03-25 10:00:00" });

    const result = run(db.getAuditMovements({ page: 1, pageSize: 50 }));
    const anomalyRow = result.rows.find((r) => r.quantity === 500);
    const normalRow = result.rows.find((r) => r.quantity === 10);
    expect(anomalyRow?.isAnomaly).toBe(true);
    expect(normalRow?.isAnomaly).toBe(false);
  });
});

describe("getAuditAnalytics", () => {
  it("returns correct personnel breakdown", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { type: "receive", quantity: 50, performedBy: "Alice" });
    seedMovement(testDb.db, itemId, { type: "issue", quantity: 10, performedBy: "Alice" });
    seedMovement(testDb.db, itemId, { type: "receive", quantity: 30, performedBy: "Bob" });

    const result = run(db.getAuditAnalytics({}));
    expect(result.byPersonnel).toHaveLength(2);

    const alice = result.byPersonnel.find((p) => p.performedBy === "Alice");
    expect(alice?.receiveCount).toBe(1);
    expect(alice?.issueCount).toBe(1);
    expect(alice?.totalQuantity).toBe(60);
  });

  it("returns correct item breakdown", () => {
    const itemA = seedItem(testDb.db, { name: "Item A", currentQuantity: 100 });
    const itemB = seedItem(testDb.db, { name: "Item B", currentQuantity: 50 });
    seedMovement(testDb.db, itemA, { type: "receive", quantity: 100 });
    seedMovement(testDb.db, itemA, { type: "issue", quantity: 30 });
    seedMovement(testDb.db, itemB, { type: "receive", quantity: 50 });

    const result = run(db.getAuditAnalytics({}));
    expect(result.byItem).toHaveLength(2);

    const a = result.byItem.find((i) => i.itemName === "Item A");
    expect(a?.receiveCount).toBe(1);
    expect(a?.issueCount).toBe(1);
    expect(a?.totalReceived).toBe(100);
    expect(a?.totalIssued).toBe(30);
    expect(a?.netChange).toBe(70);
  });

  it("returns correct alert frequency", () => {
    const itemId = seedItem(testDb.db, { name: "Alert Item" });
    seedAlert(testDb.db, itemId, { status: "open" });
    seedAlert(testDb.db, itemId, { status: "resolved" });

    const result = run(db.getAuditAnalytics({}));
    expect(result.alertFrequency).toHaveLength(1);
    expect(result.alertFrequency[0].triggerCount).toBe(2);
    expect(result.alertFrequency[0].currentStatus).toBe("open");
  });

  it("NULL performed_by grouped correctly in personnel analytics", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { performedBy: null });
    seedMovement(testDb.db, itemId, { performedBy: null });

    const result = run(db.getAuditAnalytics({}));
    const nullGroup = result.byPersonnel.find((p) => p.performedBy === "(not provided)");
    expect(nullGroup).toBeDefined();
    expect(nullGroup?.receiveCount).toBe(2);
  });

  it("item with alerts but 0 movements in range shows in alert frequency", () => {
    const itemId = seedItem(testDb.db);
    seedAlert(testDb.db, itemId);
    // No movements for this item

    const result = run(db.getAuditAnalytics({}));
    expect(result.alertFrequency).toHaveLength(1);
    expect(result.byItem).toHaveLength(0);
  });
});

describe("migration v3", () => {
  it("indexes are created on populated database", () => {
    // The test DB already has migrations run in beforeEach
    const indexes = testDb.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_inventory_movements_%'")
      .all() as Array<{ name: string }>;

    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_inventory_movements_performed_at");
    expect(names).toContain("idx_inventory_movements_type");
    expect(names).toContain("idx_inventory_movements_performed_by");
    expect(names).toContain("idx_inventory_movements_item_date");
  });
});
