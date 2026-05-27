import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";
import type { AuditReportResult, AuditReportTotals } from "../../domain/models";
import { PeriodReportPanel, buildPeriodReportCsv, pctDelta, type PeriodCsvLabels } from "./PeriodReportPanel";

const getPeriodReport = vi.fn();
vi.mock("../../services/inventoryGateway", () => ({
  getPeriodReport: (...args: unknown[]) => getPeriodReport(...args),
}));

function totals(over: Partial<AuditReportTotals> = {}): AuditReportTotals {
  return {
    totalMovements: 12,
    totalReceivedQty: 40,
    totalIssuedQty: 30,
    netQty: 10,
    receivedValueMinor: 8000,
    issuedValueMinor: 5000,
    netValueMinor: 3000,
    valuedItemCount: 3,
    unvaluedItemCount: 1,
    hasData: true,
    ...over,
  };
}

function makeReport(over: Partial<AuditReportResult> = {}): AuditReportResult {
  return {
    period: { label: "May 2026", from: "2026-05-01 00:00:00", to: "2026-05-31 23:59:59" },
    priorPeriod: { label: "April 2026", from: "2026-04-01 00:00:00", to: "2026-04-30 23:59:59" },
    yoyPeriod: { label: "May 2025", from: "2025-05-01 00:00:00", to: "2025-05-31 23:59:59" },
    totals: totals(),
    priorTotals: totals({ issuedValueMinor: 4000 }),
    yoyTotals: totals({ hasData: false, totalMovements: 0, issuedValueMinor: 0 }),
    topItems: [
      { itemId: "i1", itemName: "Bolts M6", itemSku: "SKU-1", issuedQty: 10, issuedValueMinor: 5000, hasPrice: true },
      { itemId: "i2", itemName: "Unpriced", itemSku: "SKU-2", issuedQty: 5, issuedValueMinor: 0, hasPrice: false },
    ],
    biggestMovers: [
      { itemId: "i1", itemName: "Bolts M6", itemSku: "SKU-1", currentIssuedValueMinor: 5000, priorIssuedValueMinor: 4000, deltaValueMinor: 1000 },
    ],
    trend: [
      { label: "December 2025", issuedValueMinor: 0 },
      { label: "January 2026", issuedValueMinor: 1000 },
      { label: "February 2026", issuedValueMinor: 2000 },
      { label: "March 2026", issuedValueMinor: 0 },
      { label: "April 2026", issuedValueMinor: 4000 },
      { label: "May 2026", issuedValueMinor: 5000 },
    ],
    inventoryHealth: { lowOrZeroItemCount: 2 },
    analytics: {
      summary: { totalMovements: 12, totalReceived: 40, totalIssued: 30, uniqueItems: 4, uniquePersonnel: 2 },
      byPersonnel: [{ performedBy: "Alice", receiveCount: 2, issueCount: 3, totalQuantity: 50, distinctItems: 2 }],
      byItem: [],
      alertFrequency: [],
    },
    currency: "CNY",
    ...over,
  };
}

beforeEach(() => {
  getPeriodReport.mockReset();
});
afterEach(cleanup);

describe("PeriodReportPanel", () => {
  it("defaults to a month period and renders KPIs, trend, movers, and health", async () => {
    getPeriodReport.mockResolvedValue(makeReport());
    renderWithI18n(<PeriodReportPanel language="en" />);

    // Default granularity is month (last completed month).
    await waitFor(() => expect(getPeriodReport).toHaveBeenCalled());
    expect(getPeriodReport.mock.calls[0][0].granularity).toBe("month");

    await screen.findAllByText("Value Issued");
    expect(screen.getByText("Items Hit Low/Zero")).toBeTruthy();
    expect(screen.getByText("Issued value — last 6 periods")).toBeTruthy();
    expect(screen.getByText("What moved most vs April 2026")).toBeTruthy();
    // 6 trend bars rendered, gap-free.
    expect(document.querySelectorAll(".trend-bar")).toHaveLength(6);
    // CSV + Print actions present.
    expect(screen.getByText("Export CSV")).toBeTruthy();
    expect(screen.getByText("Print")).toBeTruthy();
  });

  it("shows the YoY subline as 'no prior-year data' when last year is empty", async () => {
    getPeriodReport.mockResolvedValue(makeReport());
    renderWithI18n(<PeriodReportPanel language="en" />);
    await screen.findAllByText("Value Issued");
    expect(screen.getAllByText(/no prior-year data/).length).toBeGreaterThan(0);
  });

  it("refetches when the granularity changes", async () => {
    getPeriodReport.mockResolvedValue(makeReport());
    renderWithI18n(<PeriodReportPanel language="en" />);
    await screen.findAllByText("Value Issued");

    fireEvent.click(screen.getByTestId("report-granularity-quarter"));
    await waitFor(() =>
      expect(getPeriodReport.mock.calls.some((c) => c[0].granularity === "quarter")).toBe(true),
    );
  });

  it("renders the empty-period state when there is no movement", async () => {
    getPeriodReport.mockResolvedValue(
      makeReport({ totals: totals({ hasData: false, totalMovements: 0 }) }),
    );
    renderWithI18n(<PeriodReportPanel language="en" />);
    await screen.findByText(/No inventory movement in/);
  });
});

describe("buildPeriodReportCsv", () => {
  const labels: PeriodCsvLabels = {
    reportTitle: "Period Summary", period: "Date Range", generatedOn: "Generated",
    currency: "Currency", valueCaveat: "Values shown at current prices.",
    unpricedNote: "Value excludes 1 of 4 unpriced items.", metric: "Metric", value: "Value",
    topItemsTitle: "Top items by issued value", byPersonnelTitle: "By Personnel", alertsTitle: "Alert Frequency",
    item: "Item Name", sku: "SKU", issuedQty: "Issued (qty)", issuedValue: "Value Issued",
    personnel: "Performed By", receives: "Receives", issues: "Issues", totalQty: "Total Qty Moved", triggers: "Triggers",
  };

  it("includes all sections, the unpriced caveat, and escapes quotes", () => {
    const report = makeReport({
      topItems: [{ itemId: "i1", itemName: 'Quote"Item', itemSku: "SKU-1", issuedQty: 10, issuedValueMinor: 5000, hasPrice: true }],
    });
    const csv = buildPeriodReportCsv(report, "en", labels, "2026-05-31 12:00");
    expect(csv).toContain("Period Summary");
    expect(csv).toContain("Top items by issued value");
    expect(csv).toContain("By Personnel");
    expect(csv).toContain("Alert Frequency");
    expect(csv).toContain("Value excludes 1 of 4 unpriced items.");
    expect(csv).toContain('Quote""Item'); // doubled quote escaping
  });

  it("omits the unpriced caveat when all moved items are priced", () => {
    const report = makeReport({ totals: totals({ unvaluedItemCount: 0 }) });
    const csv = buildPeriodReportCsv(report, "en", labels, "2026-05-31 12:00");
    expect(csv).not.toContain("Value excludes");
  });

  it("renders an unpriced top item as '—', never a fake 0 value (honest valuation)", () => {
    // Default fixture has a priced "Bolts M6" and an unpriced "Unpriced" item.
    const csv = buildPeriodReportCsv(makeReport(), "en", labels, "2026-05-31 12:00");
    const unpricedRow = csv.split("\n").find((l) => l.includes("Unpriced"));
    expect(unpricedRow).toBeDefined();
    expect(unpricedRow).toContain("—");
    // The unpriced row must not carry a formatted zero money value.
    expect(unpricedRow).not.toMatch(/[$¥]?0\.00/);
  });
});

describe("pctDelta", () => {
  it("returns a flat 0% when both periods are zero", () => {
    expect(pctDelta(0, 0)).toEqual({ text: "0%", direction: "flat" });
  });

  it("from a zero baseline, follows the sign of current (the net-value regression)", () => {
    // 0 → +500 is an increase; 0 → −500 is a decrease, never "+100% up".
    expect(pctDelta(500, 0)).toEqual({ text: "+100%", direction: "up" });
    expect(pctDelta(-500, 0)).toEqual({ text: "−100%", direction: "down" });
  });

  it("computes signed percentage change against a non-zero prior", () => {
    expect(pctDelta(150, 100)).toEqual({ text: "+50%", direction: "up" });
    expect(pctDelta(80, 100)).toEqual({ text: "-20%", direction: "down" });
    expect(pctDelta(100, 100)).toEqual({ text: "0%", direction: "flat" });
  });

  it("uses the magnitude of a negative prior as the denominator", () => {
    // prior=-100, current=-50 → (−50 − −100)/|−100| = +50%.
    expect(pctDelta(-50, -100)).toEqual({ text: "+50%", direction: "up" });
  });
});
