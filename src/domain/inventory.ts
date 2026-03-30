import type { DashboardMetrics, InventoryAlert, InventoryItem, RefillOrder } from "./models";

export function buildDashboardMetrics(
  items: InventoryItem[],
  alerts: InventoryAlert[],
  refillOrders: RefillOrder[],
): DashboardMetrics {
  return {
    totalItems: items.length,
    totalUnits: items.reduce((sum, item) => sum + item.currentQuantity, 0),
    lowStockCount: items.filter((item) => item.status === "low_stock").length,
    outOfStockCount: items.filter((item) => item.status === "out_of_stock").length,
    openAlertCount: alerts.filter((alert) => alert.status === "open").length,
    pendingRefillOrderCount: refillOrders.filter((order) => order.status !== "received" && order.status !== "cancelled").length,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

