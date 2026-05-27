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
import { resolvePeriodBounds } from "../../src/shared/auditPeriod";
import type { AuditReportPeriodArgs } from "../../src/shared/auditPeriod";

let testDb: TestDb;
let db: ReturnType<typeof makeDatabaseService>;

beforeEach(() => {
  testDb = createTestDb();
  runPendingMigrations(testDb.db);
  db = makeDatabaseService(testDb.dbPath);
});

afterEach(async () => {
  db.close();
  await testDb.cleanup();
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

  it("sortBy date asc returns oldest first", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { performedAt: "2026-03-10 10:00:00" });
    seedMovement(testDb.db, itemId, { performedAt: "2026-03-15 10:00:00" });
    seedMovement(testDb.db, itemId, { performedAt: "2026-03-01 10:00:00" });

    const result = run(db.getAuditMovements({ sortBy: "date", sortDir: "asc", page: 1, pageSize: 50 }));
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].performedAt).toBe("2026-03-01 10:00:00");
    expect(result.rows[2].performedAt).toBe("2026-03-15 10:00:00");
  });

  it("sortBy quantity orders by quantity", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { quantity: 100 });
    seedMovement(testDb.db, itemId, { quantity: 10 });
    seedMovement(testDb.db, itemId, { quantity: 50 });

    const asc = run(db.getAuditMovements({ sortBy: "quantity", sortDir: "asc", page: 1, pageSize: 50 }));
    expect(asc.rows[0].quantity).toBe(10);
    expect(asc.rows[2].quantity).toBe(100);

    const desc = run(db.getAuditMovements({ sortBy: "quantity", sortDir: "desc", page: 1, pageSize: 50 }));
    expect(desc.rows[0].quantity).toBe(100);
    expect(desc.rows[2].quantity).toBe(10);
  });

  it("invalid sortBy falls back to default order (newest first)", () => {
    const itemId = seedItem(testDb.db);
    seedMovement(testDb.db, itemId, { performedAt: "2026-03-01 10:00:00" });
    seedMovement(testDb.db, itemId, { performedAt: "2026-03-15 10:00:00" });

    const result = run(db.getAuditMovements({ sortBy: "nonexistent", sortDir: "asc", page: 1, pageSize: 50 }));
    expect(result.rows).toHaveLength(2);
    // Default is newest first
    expect(result.rows[0].performedAt).toBe("2026-03-15 10:00:00");
  });

  it("sort combined with filters and pagination", () => {
    const itemId = seedItem(testDb.db);
    for (let i = 0; i < 5; i++) {
      seedMovement(testDb.db, itemId, { type: "receive", quantity: (i + 1) * 10 });
    }
    seedMovement(testDb.db, itemId, { type: "issue", quantity: 5 });

    const result = run(db.getAuditMovements({
      movementType: "receive",
      sortBy: "quantity",
      sortDir: "asc",
      page: 1,
      pageSize: 3,
    }));
    expect(result.rows).toHaveLength(3);
    expect(result.total).toBe(5);
    expect(result.rows[0].quantity).toBe(10);
    expect(result.rows[1].quantity).toBe(20);
    expect(result.rows[2].quantity).toBe(30);
  });
});

describe("getAuditReport", () => {
  const MAY: AuditReportPeriodArgs = { granularity: "month", year: 2026, index: 5 };

  it("totals split receive/issue value and distinguish NULL vs 0 price", () => {
    const priced = seedItem(testDb.db, { name: "Priced", unitPriceMinor: 500 });
    const free = seedItem(testDb.db, { name: "Free", unitPriceMinor: 0 });
    const unpriced = seedItem(testDb.db, { name: "Unpriced", unitPriceMinor: null });
    seedMovement(testDb.db, priced, { type: "issue", quantity: 10, performedAt: "2026-05-10 09:00:00" });
    seedMovement(testDb.db, priced, { type: "receive", quantity: 4, performedAt: "2026-05-11 09:00:00" });
    seedMovement(testDb.db, free, { type: "issue", quantity: 7, performedAt: "2026-05-12 09:00:00" });
    seedMovement(testDb.db, unpriced, { type: "issue", quantity: 3, performedAt: "2026-05-13 09:00:00" });

    const r = run(db.getAuditReport(MAY));
    expect(r.totals.totalMovements).toBe(4);
    expect(r.totals.totalReceivedQty).toBe(4);
    expect(r.totals.totalIssuedQty).toBe(20);
    expect(r.totals.receivedValueMinor).toBe(2000); // 4 * 500
    expect(r.totals.issuedValueMinor).toBe(5000); // 10 * 500; free/unpriced add 0
    expect(r.totals.netValueMinor).toBe(-3000);
    expect(r.totals.valuedItemCount).toBe(2); // priced + free (0 is a price)
    expect(r.totals.unvaluedItemCount).toBe(1); // NULL price excluded from value
    expect(r.totals.hasData).toBe(true);
  });

  it("topItems are sorted by issued value desc and flag unpriced items", () => {
    const a = seedItem(testDb.db, { name: "A", unitPriceMinor: 100 });
    const b = seedItem(testDb.db, { name: "B", unitPriceMinor: 900 });
    const c = seedItem(testDb.db, { name: "C", unitPriceMinor: null });
    seedMovement(testDb.db, a, { type: "issue", quantity: 10, performedAt: "2026-05-10 09:00:00" }); // 1000
    seedMovement(testDb.db, b, { type: "issue", quantity: 10, performedAt: "2026-05-10 09:00:00" }); // 9000
    seedMovement(testDb.db, c, { type: "issue", quantity: 50, performedAt: "2026-05-10 09:00:00" }); // 0 (unpriced)

    const r = run(db.getAuditReport(MAY));
    expect(r.topItems[0].itemName).toBe("B");
    expect(r.topItems[0].issuedValueMinor).toBe(9000);
    const cRow = r.topItems.find((x) => x.itemName === "C");
    expect(cRow?.hasPrice).toBe(false);
  });

  it("prior-period window is the previous month", () => {
    const item = seedItem(testDb.db, { unitPriceMinor: 100 });
    seedMovement(testDb.db, item, { type: "issue", quantity: 5, performedAt: "2026-05-10 09:00:00" });
    seedMovement(testDb.db, item, { type: "issue", quantity: 8, performedAt: "2026-04-10 09:00:00" });

    const r = run(db.getAuditReport(MAY));
    expect(r.priorPeriod.label).toBe("April 2026");
    expect(r.totals.issuedValueMinor).toBe(500);
    expect(r.priorTotals.issuedValueMinor).toBe(800);
  });

  it("analytics equals getAuditAnalytics for the period bounds", () => {
    const item = seedItem(testDb.db, { name: "Widget", unitPriceMinor: 100 });
    seedMovement(testDb.db, item, { type: "issue", quantity: 5, performedBy: "Alice", performedAt: "2026-05-10 09:00:00" });
    const bounds = resolvePeriodBounds(MAY);

    const r = run(db.getAuditReport(MAY));
    const analytics = run(db.getAuditAnalytics({ dateFrom: bounds.from, dateTo: bounds.to }));
    expect(r.analytics).toEqual(analytics);
  });

  it("biggestMovers include new (prior=0) and dropped (current=0) items", () => {
    const grew = seedItem(testDb.db, { name: "Grew", unitPriceMinor: 100 });
    const fresh = seedItem(testDb.db, { name: "New", unitPriceMinor: 100 });
    const dropped = seedItem(testDb.db, { name: "Dropped", unitPriceMinor: 100 });
    // Grew: prior 1000, current 5000
    seedMovement(testDb.db, grew, { type: "issue", quantity: 10, performedAt: "2026-04-10 09:00:00" });
    seedMovement(testDb.db, grew, { type: "issue", quantity: 50, performedAt: "2026-05-10 09:00:00" });
    // New: only May
    seedMovement(testDb.db, fresh, { type: "issue", quantity: 40, performedAt: "2026-05-10 09:00:00" });
    // Dropped: only April
    seedMovement(testDb.db, dropped, { type: "issue", quantity: 30, performedAt: "2026-04-10 09:00:00" });

    const r = run(db.getAuditReport(MAY));
    const names = r.biggestMovers.map((m) => m.itemName);
    expect(names).toContain("New"); // prior = 0
    expect(names).toContain("Dropped"); // current = 0
    const droppedRow = r.biggestMovers.find((m) => m.itemName === "Dropped");
    expect(droppedRow?.currentIssuedValueMinor).toBe(0);
    expect(droppedRow?.deltaValueMinor).toBeLessThan(0);
  });

  it("trend returns 6 buckets oldest->newest with zero-movement periods present as 0", () => {
    const item = seedItem(testDb.db, { unitPriceMinor: 100 });
    seedMovement(testDb.db, item, { type: "issue", quantity: 10, performedAt: "2026-05-10 09:00:00" }); // May = 1000
    seedMovement(testDb.db, item, { type: "issue", quantity: 5, performedAt: "2026-03-10 09:00:00" }); // Mar = 500

    const r = run(db.getAuditReport(MAY));
    expect(r.trend).toHaveLength(6);
    expect(r.trend.map((p) => p.label)).toEqual([
      "December 2025",
      "January 2026",
      "February 2026",
      "March 2026",
      "April 2026",
      "May 2026",
    ]);
    expect(r.trend[3].issuedValueMinor).toBe(500); // March
    expect(r.trend[4].issuedValueMinor).toBe(0); // April — zero-movement bucket still present
    expect(r.trend[5].issuedValueMinor).toBe(1000); // May
  });

  it("inventoryHealth counts distinct items alerted within the period", () => {
    const a = seedItem(testDb.db);
    const b = seedItem(testDb.db);
    seedAlert(testDb.db, a, { triggeredAt: "2026-05-05 09:00:00" });
    seedAlert(testDb.db, a, { triggeredAt: "2026-05-20 09:00:00" }); // same item twice
    seedAlert(testDb.db, b, { triggeredAt: "2026-05-15 09:00:00" });
    seedAlert(testDb.db, b, { triggeredAt: "2026-04-15 09:00:00" }); // outside period

    const r = run(db.getAuditReport(MAY));
    expect(r.inventoryHealth.lowOrZeroItemCount).toBe(2);
  });

  it("YoY hasData is false when last year's window is empty", () => {
    const item = seedItem(testDb.db, { unitPriceMinor: 100 });
    seedMovement(testDb.db, item, { type: "issue", quantity: 5, performedAt: "2026-05-10 09:00:00" });

    const r = run(db.getAuditReport(MAY));
    expect(r.yoyPeriod.label).toBe("May 2025");
    expect(r.yoyTotals.hasData).toBe(false);
  });

  it("reports hasData=false for an empty period", () => {
    seedItem(testDb.db, { unitPriceMinor: 100 }); // item exists but no movements
    const r = run(db.getAuditReport({ granularity: "month", year: 2026, index: 8 }));
    expect(r.totals.hasData).toBe(false);
    expect(r.totals.totalMovements).toBe(0);
    expect(r.topItems).toHaveLength(0);
  });
});
