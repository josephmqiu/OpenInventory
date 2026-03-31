import { describe, expect, it } from "vitest";
import { buildDashboardMetrics } from "./inventory";
import type { InventoryAlert, InventoryItem } from "./models";

const items: InventoryItem[] = [
  {
    id: "item-1",
    sku: "SKU-001",
    qrCodeDataUrl: "data:image/png;base64,one",
    name: "Copper Wire",
    category: "Raw Material",
    location: "A-01",
    unit: "meters",
    supplier: "ACME",
    currentQuantity: 42,
    reorderQuantity: 20,
    status: "in_stock",
    lastUpdated: "2026-03-30T16:30:00Z",
  },
  {
    id: "item-2",
    sku: "SKU-002",
    qrCodeDataUrl: "data:image/png;base64,two",
    name: "Bolts",
    category: "Parts",
    location: "B-03",
    unit: "pcs",
    supplier: "Fasteners Inc.",
    currentQuantity: 8,
    reorderQuantity: 10,
    status: "low_stock",
    lastUpdated: "2026-03-30T16:45:00Z",
  },
  {
    id: "item-3",
    sku: "SKU-003",
    qrCodeDataUrl: "data:image/png;base64,three",
    name: "Labels",
    category: "Packaging",
    location: "C-07",
    unit: "rolls",
    supplier: "PackPro",
    currentQuantity: 0,
    reorderQuantity: 5,
    status: "out_of_stock",
    lastUpdated: "2026-03-30T17:00:00Z",
  },
];

const alerts: InventoryAlert[] = [
  {
    id: "alert-1",
    itemName: "Bolts",
    sku: "SKU-002",
    currentQuantity: 8,
    thresholdQuantity: 10,
    status: "open",
    triggeredAt: "2026-03-30T16:40:00Z",
  },
  {
    id: "alert-2",
    itemName: "Labels",
    sku: "SKU-003",
    currentQuantity: 0,
    thresholdQuantity: 5,
    status: "resolved",
    triggeredAt: "2026-03-30T16:50:00Z",
  },
];

describe("buildDashboardMetrics", () => {
  it("calculates aggregate dashboard metrics from items and alerts", () => {
    expect(buildDashboardMetrics(items, alerts)).toEqual({
      totalItems: 3,
      totalUnits: 50,
      lowStockCount: 1,
      outOfStockCount: 1,
      openAlertCount: 1,
    });
  });

  it("returns zeroed metrics when there is no inventory data", () => {
    expect(buildDashboardMetrics([], [])).toEqual({
      totalItems: 0,
      totalUnits: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      openAlertCount: 0,
    });
  });
});
