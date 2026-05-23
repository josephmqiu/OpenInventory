import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryAlert, InventoryItem } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { DashboardView } from "./DashboardView";

// --- Sort safety note ---
// The sortData utility uses `[...data].sort()` (spread-then-sort), which is safe.
// DashboardView uses `[...(array)].sort()` for topMovers. We verify no mutation below.

vi.mock("../../services/inventoryGateway", () => ({
  getAuditAnalytics: vi.fn().mockResolvedValue({
    summary: {
      totalMovements: 12,
      totalReceived: 80,
      totalIssued: 30,
      uniqueItems: 3,
      uniquePersonnel: 2,
    },
    byPersonnel: [],
    byItem: [
      { itemId: "item-1", itemName: "Bolts M6", itemSku: "SKU-001", receiveCount: 3, issueCount: 2, totalReceived: 50, totalIssued: 20, netChange: 30, currentQuantity: 150 },
      { itemId: "item-2", itemName: "Nuts M8", itemSku: "SKU-002", receiveCount: 2, issueCount: 1, totalReceived: 30, totalIssued: 10, netChange: 20, currentQuantity: 5 },
    ],
    alertFrequency: [],
  }),
}));

const items: InventoryItem[] = [
  {
    id: "item-1",
    sku: "SKU-001",
    qrCodeDataUrl: "http://127.0.0.1:4123/issue/item-1",
    name: "Bolts M6",
    category: "Parts",
    location: "Warehouse A",
    unit: "pcs",
    supplier: "Fasteners Inc.",
    currentQuantity: 150,
    reorderQuantity: 50,
    unitPriceMinor: 1000,
    status: "in_stock",
    lastUpdated: "2026-03-31T10:00:00Z",
  },
  {
    id: "item-2",
    sku: "SKU-002",
    qrCodeDataUrl: "http://127.0.0.1:4123/issue/item-2",
    name: "Nuts M8",
    category: "Parts",
    location: "Warehouse B",
    unit: "pcs",
    supplier: "Fasteners Inc.",
    currentQuantity: 5,
    reorderQuantity: 20,
    unitPriceMinor: null,
    status: "low_stock",
    lastUpdated: "2026-03-30T09:00:00Z",
  },
  {
    id: "item-3",
    sku: "SKU-003",
    qrCodeDataUrl: "",
    name: "Washers",
    category: "Parts",
    location: "Warehouse A",
    unit: "pcs",
    supplier: "",
    currentQuantity: 0,
    reorderQuantity: 10,
    unitPriceMinor: null,
    status: "out_of_stock",
    lastUpdated: "2026-03-29T08:00:00Z",
  },
];

const alerts: InventoryAlert[] = [
  {
    id: "alert-1",
    itemName: "Nuts M8",
    sku: "SKU-002",
    currentQuantity: 5,
    thresholdQuantity: 20,
    status: "open",
    triggeredAt: "2026-04-01T10:00:00Z",
  },
  {
    id: "alert-2",
    itemName: "Washers",
    sku: "SKU-003",
    currentQuantity: 0,
    thresholdQuantity: 10,
    status: "open",
    triggeredAt: "2026-04-01T11:00:00Z",
  },
  {
    id: "alert-3",
    itemName: "Bolts M6",
    sku: "SKU-001",
    currentQuantity: 150,
    thresholdQuantity: 50,
    status: "resolved",
    triggeredAt: "2026-03-28T09:00:00Z",
  },
];

function renderDashboard(
  overrides: Partial<React.ComponentProps<typeof DashboardView>> = {},
) {
  const props: React.ComponentProps<typeof DashboardView> = {
    items,
    alerts,
    language: "en",
    currency: "CNY",
    onNavigateToInventory: vi.fn(),
    onNavigateToItem: vi.fn(),
    ...overrides,
  };

  const result = renderWithI18n(<DashboardView {...props} />, props.language);
  return { ...result, props };
}

/** Helper: find the metric card value by its label text */
function getMetricValue(label: string): string | undefined {
  const cards = document.querySelectorAll(".metric-card");
  for (const card of cards) {
    const labelEl = card.querySelector(".metric-card__label");
    if (labelEl?.textContent === label) {
      return card.querySelector(".metric-card__value")?.textContent ?? undefined;
    }
  }
  return undefined;
}

afterEach(cleanup);

describe("DashboardView", () => {
  it("renders metric cards with correct counts from snapshot", () => {
    renderDashboard();

    // Total Items: 3
    expect(getMetricValue("Total Items")).toBe("3");

    // Combined Quantity: 150 + 5 + 0 = 155
    expect(getMetricValue("Combined Quantity")).toBe("155");

    // Low Stock: 1
    expect(getMetricValue("Low Stock")).toBe("1");

    // Out Of Stock: 1
    expect(getMetricValue("Out Of Stock")).toBe("1");

    // Open Alerts: 2
    expect(getMetricValue("Open Alerts")).toBe("2");
  });

  it("renders the overview tab by default", () => {
    const { container } = renderDashboard();

    const overviewTab = container.querySelector(".filter-tab--active");
    expect(overviewTab?.textContent).toContain("Overview");
  });

  it("navigates to inventory with 'all' filter when Total Items is clicked", () => {
    const { props } = renderDashboard();

    const totalItemsCard = screen.getByRole("button", { name: "Total Items" });
    fireEvent.click(totalItemsCard);

    expect(props.onNavigateToInventory).toHaveBeenCalledWith("all");
  });

  it("navigates to inventory with 'low_stock' filter when Low Stock is clicked", () => {
    const { props } = renderDashboard();

    const lowStockCard = screen.getByRole("button", { name: "Low Stock" });
    fireEvent.click(lowStockCard);

    expect(props.onNavigateToInventory).toHaveBeenCalledWith("low_stock");
  });

  it("navigates to inventory with 'out_of_stock' filter when Out of Stock is clicked", () => {
    const { props } = renderDashboard();

    // i18n resolves to "Out Of Stock" (capitalized Of)
    const oosCard = screen.getByRole("button", { name: "Out Of Stock" });
    fireEvent.click(oosCard);

    expect(props.onNavigateToInventory).toHaveBeenCalledWith("out_of_stock");
  });

  it("switches to alerts tab when Alerts tab is clicked", () => {
    const { container } = renderDashboard();

    // Use the dashboard-level filter tabs (not table header ones)
    const dashTabs = container.querySelectorAll(".dashboard-view > .filter-tabs > .filter-tab");
    const alertsTab = dashTabs[1];
    fireEvent.click(alertsTab);

    // AlertsPanel renders its own filter tabs: All, Open, Resolved
    const innerTabs = container.querySelectorAll(".panel .filter-tab");
    expect(innerTabs.length).toBeGreaterThanOrEqual(3);
  });

  it("shows open alert count badge on the Alerts tab", () => {
    const { container } = renderDashboard();

    const dashTabs = container.querySelectorAll(".dashboard-view > .filter-tabs > .filter-tab");
    const alertsTab = dashTabs[1];
    const badge = alertsTab?.querySelector(".filter-tab__count");
    expect(badge?.textContent).toBe("2");
  });

  it("renders the stock status bar when items exist", () => {
    const { container } = renderDashboard();

    const stockBar = container.querySelector(".stock-bar");
    expect(stockBar).toBeTruthy();

    // ok count: 3 - 1 - 1 = 1
    const okSegment = container.querySelector(".stock-bar__segment--ok");
    expect(okSegment?.textContent).toBe("1");

    const lowSegment = container.querySelector(".stock-bar__segment--low");
    expect(lowSegment?.textContent).toBe("1");

    const oosSegment = container.querySelector(".stock-bar__segment--oos");
    expect(oosSegment?.textContent).toBe("1");
  });

  it("does not render stock bar when items array is empty", () => {
    const { container } = renderDashboard({ items: [] });

    expect(container.querySelector(".stock-bar")).toBeNull();
  });

  it("renders recent alerts section in overview tab", () => {
    renderDashboard();

    expect(screen.getByText("Recent Alerts")).toBeTruthy();
    // The 2 open alerts should appear as recent alerts
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.getByText("Washers")).toBeTruthy();
  });

  it("shows 'all above reorder' when there are no open alerts", () => {
    const resolvedAlerts = alerts.map((a) => ({ ...a, status: "resolved" as const }));
    renderDashboard({ alerts: resolvedAlerts });

    expect(screen.getByText("All items above reorder levels.")).toBeTruthy();
  });

  it("renders the 'view all low-stock items' link", () => {
    const { props } = renderDashboard();

    const link = screen.getByText("View all low-stock items");
    fireEvent.click(link);

    expect(props.onNavigateToInventory).toHaveBeenCalledWith("low_stock");
  });

  it("does not mutate the original items or alerts arrays (sort safety)", () => {
    const itemsCopy = [...items];
    const alertsCopy = [...alerts];

    renderDashboard({ items: itemsCopy, alerts: alertsCopy });

    // Verify the arrays were not mutated by in-place .sort()
    expect(itemsCopy).toEqual(items);
    expect(alertsCopy).toEqual(alerts);
  });

  it("renders movement summary when analytics data loads", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Movement Summary (30 Days)")).toBeTruthy();
    });

    expect(screen.getByText("Total Movements")).toBeTruthy();
  });

  it("renders top movers when analytics data loads", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Top Movers (30 Days)")).toBeTruthy();
    });
  });
});
