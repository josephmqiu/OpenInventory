import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";

const getAuditAnalyticsMock = vi.fn().mockResolvedValue({
  summary: {
    totalMovements: 5,
    totalReceived: 3,
    totalIssued: 2,
    uniqueItems: 2,
    uniquePersonnel: 1,
  },
  byPersonnel: [
    { performedBy: "Alice", receiveCount: 3, issueCount: 2, totalQuantity: 50, distinctItems: 2 },
  ],
  byItem: [
    {
      itemId: "item-1",
      itemName: "Widget A",
      itemSku: "WA-001",
      receiveCount: 3,
      issueCount: 2,
      totalReceived: 30,
      totalIssued: 20,
      netChange: 10,
      currentQuantity: 100,
    },
  ],
  alertFrequency: [],
});

vi.mock("../../services/inventoryGateway", () => ({
  getAuditAnalytics: (...args: unknown[]) => getAuditAnalyticsMock(...args),
}));

import { AuditSummaryView } from "./AuditSummaryView";

afterEach(() => {
  cleanup();
  getAuditAnalyticsMock.mockClear();
});

describe("AuditSummaryView", () => {
  it("renders personnel summary data", async () => {
    renderWithI18n(
      <AuditSummaryView
        language="en"
        filters={{ page: 1, pageSize: 50, sortBy: "name", sortDir: "asc" }}
        view="personnel"
        onItemClick={vi.fn()}
      />,
      "en",
    );

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeTruthy();
    });
  });

  it("renders items summary with clickable item names", async () => {
    renderWithI18n(
      <AuditSummaryView
        language="en"
        filters={{ page: 1, pageSize: 50 }}
        view="items"
        onItemClick={vi.fn()}
      />,
      "en",
    );

    await waitFor(() => {
      expect(screen.getByText("Widget A")).toBeTruthy();
      expect(screen.getByText("WA-001")).toBeTruthy();
    });
  });

  it("strips sortBy and sortDir from filters sent to getAuditAnalytics (regression: analytics-filter-spread-leaks-sort-fields)", async () => {
    renderWithI18n(
      <AuditSummaryView
        language="en"
        filters={{
          dateFrom: "2026-01-01",
          dateTo: "2026-04-01",
          page: 1,
          pageSize: 50,
          sortBy: "name",
          sortDir: "asc",
        }}
        view="personnel"
        onItemClick={vi.fn()}
      />,
      "en",
    );

    await waitFor(() => {
      expect(getAuditAnalyticsMock).toHaveBeenCalled();
    });

    const passedFilters = getAuditAnalyticsMock.mock.calls[0][0] as Record<string, unknown>;
    expect(passedFilters).not.toHaveProperty("sortBy");
    expect(passedFilters).not.toHaveProperty("sortDir");
    expect(passedFilters).not.toHaveProperty("page");
    expect(passedFilters).not.toHaveProperty("pageSize");
    // Should retain date range filters
    expect(passedFilters).toHaveProperty("dateFrom", "2026-01-01");
    expect(passedFilters).toHaveProperty("dateTo", "2026-04-01");
  });
});
