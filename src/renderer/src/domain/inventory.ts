import type { DashboardMetrics, InventoryAlert, InventoryItem } from "./models";

export function buildDashboardMetrics(
  items: InventoryItem[],
  alerts: InventoryAlert[],
): DashboardMetrics {
  return {
    totalItems: items.length,
    totalUnits: items.reduce((sum, item) => sum + item.currentQuantity, 0),
    lowStockCount: items.filter((item) => item.status === "low_stock").length,
    outOfStockCount: items.filter((item) => item.status === "out_of_stock").length,
    openAlertCount: alerts.filter((alert) => alert.status === "open").length,
  };
}
