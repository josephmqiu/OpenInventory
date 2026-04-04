import { describe, expect, it } from "vitest";
import type { AuditMovementRow } from "../../domain/models";
import { buildAuditCsvContent } from "./AuditLogTable";
import type { AuditCsvLabels } from "./AuditLogTable";

const labels: AuditCsvLabels = {
  date: "Date",
  itemName: "Item Name",
  sku: "SKU",
  type: "Type",
  quantity: "Quantity",
  previousQuantity: "Previous Qty",
  newQuantity: "New Qty",
  performedBy: "Performed By",
  reason: "Reason",
  referenceNo: "Reference No",
  notes: "Notes",
  receiveStock: "Receive Stock",
  issueMaterial: "Issue Material",
};

function makeRow(overrides: Partial<AuditMovementRow> = {}): AuditMovementRow {
  return {
    id: "mov-1",
    itemId: "item-1",
    itemName: "Bolts M6",
    itemSku: "SKU-BOLTS-M6",
    movementType: "receive",
    quantity: 50,
    previousQuantity: 100,
    newQuantity: 150,
    performedBy: "Alice",
    reason: "Restock",
    referenceNo: "PO-001",
    notes: null,
    performedAt: "2026-03-31 10:00:00",
    isAnomaly: false,
    ...overrides,
  };
}

describe("buildAuditCsvContent", () => {
  it("produces a header row from labels", () => {
    const csv = buildAuditCsvContent([], labels);
    expect(csv).toBe(
      '"Date","Item Name","SKU","Type","Quantity","Previous Qty","New Qty","Performed By","Reason","Reference No","Notes"',
    );
  });

  it("maps receive rows with correct type label", () => {
    const csv = buildAuditCsvContent([makeRow()], labels);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Receive Stock"');
    expect(lines[1]).toContain('"Bolts M6"');
    expect(lines[1]).toContain('"SKU-BOLTS-M6"');
  });

  it("maps issue rows with correct type label", () => {
    const csv = buildAuditCsvContent([makeRow({ movementType: "issue" })], labels);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Issue Material"');
  });

  it("escapes double quotes by doubling them", () => {
    const csv = buildAuditCsvContent(
      [makeRow({ reason: 'Restock "urgent"' })],
      labels,
    );
    expect(csv).toContain('"Restock ""urgent"""');
  });

  it("wraps fields containing commas in quotes", () => {
    const csv = buildAuditCsvContent(
      [makeRow({ itemName: "Bolts, Nuts, and Washers" })],
      labels,
    );
    expect(csv).toContain('"Bolts, Nuts, and Washers"');
  });

  it("handles newlines in fields", () => {
    const csv = buildAuditCsvContent(
      [makeRow({ notes: "Line 1\nLine 2" })],
      labels,
    );
    // The newline is inside a quoted field, which is valid CSV
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it("handles null fields as empty strings", () => {
    const csv = buildAuditCsvContent(
      [makeRow({ performedBy: null, reason: null, referenceNo: null, notes: null })],
      labels,
    );
    const lines = csv.split("\n");
    const fields = lines[1].split(",");
    // performedBy, reason, referenceNo, notes should all be empty quoted strings
    expect(fields[7]).toBe('""');
    expect(fields[8]).toBe('""');
    expect(fields[9]).toBe('""');
    expect(fields[10]).toBe('""');
  });

  it("handles CJK characters in fields", () => {
    const csv = buildAuditCsvContent(
      [makeRow({ itemName: "螺栓 M6", reason: "补货" })],
      labels,
    );
    expect(csv).toContain('"螺栓 M6"');
    expect(csv).toContain('"补货"');
  });

  it("handles multiple rows", () => {
    const rows = [
      makeRow({ id: "mov-1", movementType: "receive" }),
      makeRow({ id: "mov-2", movementType: "issue", itemName: "Nuts M6" }),
    ];
    const csv = buildAuditCsvContent(rows, labels);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Receive Stock"');
    expect(lines[2]).toContain('"Issue Material"');
    expect(lines[2]).toContain('"Nuts M6"');
  });
});
