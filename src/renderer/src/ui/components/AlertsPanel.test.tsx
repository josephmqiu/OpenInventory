import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InventoryAlert } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { AlertsPanel } from "./AlertsPanel";

const alerts: InventoryAlert[] = [
  {
    id: "alert-1",
    itemName: "Bolts M6",
    sku: "SKU-001",
    currentQuantity: 3,
    thresholdQuantity: 10,
    status: "open",
    triggeredAt: "2026-04-01T10:00:00Z",
  },
  {
    id: "alert-2",
    itemName: "Nuts M8",
    sku: "SKU-002",
    currentQuantity: 0,
    thresholdQuantity: 5,
    status: "open",
    triggeredAt: "2026-04-01T11:00:00Z",
  },
  {
    id: "alert-3",
    itemName: "Washers",
    sku: "SKU-003",
    currentQuantity: 20,
    thresholdQuantity: 15,
    status: "resolved",
    triggeredAt: "2026-03-28T08:00:00Z",
  },
];

afterEach(cleanup);

describe("AlertsPanel", () => {
  it("renders alerts in a table", () => {
    renderWithI18n(<AlertsPanel alerts={alerts} language="en" />);

    expect(screen.getByText("Bolts M6")).toBeTruthy();
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.getByText("Washers")).toBeTruthy();
  });

  it("shows tab counts", () => {
    const { container } = renderWithI18n(<AlertsPanel alerts={alerts} language="en" />);

    const tabs = container.querySelectorAll(".filter-tab");

    // All tab shows total count
    const allCount = tabs[0]?.querySelector(".filter-tab__count");
    expect(allCount?.textContent).toBe("3");

    // Open tab shows open count
    const openCount = tabs[1]?.querySelector(".filter-tab__count");
    expect(openCount?.textContent).toBe("2");

    // Resolved tab shows resolved count
    const resolvedCount = tabs[2]?.querySelector(".filter-tab__count");
    expect(resolvedCount?.textContent).toBe("1");
  });

  it("filters to show only open alerts", () => {
    const { container } = renderWithI18n(<AlertsPanel alerts={alerts} language="en" />);

    const openTab = container.querySelectorAll(".filter-tab")[1];
    fireEvent.click(openTab);

    expect(screen.getByText("Bolts M6")).toBeTruthy();
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.queryByText("Washers")).toBeNull();
  });

  it("filters to show only resolved alerts", () => {
    const { container } = renderWithI18n(<AlertsPanel alerts={alerts} language="en" />);

    const resolvedTab = container.querySelectorAll(".filter-tab")[2];
    fireEvent.click(resolvedTab);

    expect(screen.queryByText("Bolts M6")).toBeNull();
    expect(screen.queryByText("Nuts M8")).toBeNull();
    expect(screen.getByText("Washers")).toBeTruthy();
  });

  it("shows all alerts when All tab is clicked after filtering", () => {
    const { container } = renderWithI18n(<AlertsPanel alerts={alerts} language="en" />);

    const tabs = container.querySelectorAll(".filter-tab");
    fireEvent.click(tabs[1]); // Open
    fireEvent.click(tabs[0]); // All

    expect(screen.getByText("Bolts M6")).toBeTruthy();
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.getByText("Washers")).toBeTruthy();
  });

  it("shows empty state when no alerts exist", () => {
    renderWithI18n(<AlertsPanel alerts={[]} language="en" />);

    expect(screen.getByText("No low-stock alerts.")).toBeTruthy();
  });

  it("shows empty state when filtered tab has no matching alerts", () => {
    const openOnly: InventoryAlert[] = [
      {
        id: "alert-1",
        itemName: "Bolts M6",
        sku: "SKU-001",
        currentQuantity: 3,
        thresholdQuantity: 10,
        status: "open",
        triggeredAt: "2026-04-01T10:00:00Z",
      },
    ];

    const { container } = renderWithI18n(<AlertsPanel alerts={openOnly} language="en" />);

    const resolvedTab = container.querySelectorAll(".filter-tab")[2];
    fireEvent.click(resolvedTab);
    expect(screen.getByText("No low-stock alerts.")).toBeTruthy();
  });

  it("renders severity bars for open alerts", () => {
    const { container } = renderWithI18n(<AlertsPanel alerts={alerts} language="en" />);

    // Bolts M6 has qty 3 (> 0) so it should be warning
    const warningBars = container.querySelectorAll(".severity-bar--warning");
    expect(warningBars.length).toBeGreaterThanOrEqual(1);

    // Nuts M8 has qty 0, so it should be danger
    const dangerBars = container.querySelectorAll(".severity-bar--danger");
    expect(dangerBars.length).toBeGreaterThanOrEqual(1);
  });

  it("does not render severity bar for resolved alerts", () => {
    // Show only resolved
    const resolvedOnly: InventoryAlert[] = [
      {
        id: "alert-3",
        itemName: "Washers",
        sku: "SKU-003",
        currentQuantity: 20,
        thresholdQuantity: 15,
        status: "resolved",
        triggeredAt: "2026-03-28T08:00:00Z",
      },
    ];

    const { container } = renderWithI18n(<AlertsPanel alerts={resolvedOnly} language="en" />);

    expect(container.querySelectorAll(".severity-bar--warning").length).toBe(0);
    expect(container.querySelectorAll(".severity-bar--danger").length).toBe(0);
  });

  it("renders status pills with correct classes", () => {
    const { container } = renderWithI18n(<AlertsPanel alerts={alerts} language="en" />);

    const openPills = container.querySelectorAll(".status-pill--alert-open");
    const resolvedPills = container.querySelectorAll(".status-pill--alert-resolved");

    expect(openPills.length).toBe(2);
    expect(resolvedPills.length).toBe(1);
  });
});
