import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";

vi.mock("../../services/inventoryGateway", () => ({
  getAuditMovements: vi.fn().mockResolvedValue({
    rows: [],
    total: 0,
    summary: {
      totalMovements: 0,
      totalReceived: 0,
      totalIssued: 0,
      uniqueItems: 0,
      uniquePersonnel: 0,
    },
  }),
  getAuditAnalytics: vi.fn().mockResolvedValue({
    summary: {
      totalMovements: 0,
      totalReceived: 0,
      totalIssued: 0,
      uniqueItems: 0,
      uniquePersonnel: 0,
    },
    byPersonnel: [],
    byItem: [],
    alertFrequency: [],
  }),
}));

vi.mock("../../app/useInventoryState", () => ({
  useInventoryState: vi.fn().mockReturnValue({
    handleDeleteMovement: vi.fn().mockResolvedValue(true),
  }),
}));

import { AuditPanel } from "./AuditPanel";

afterEach(cleanup);

describe("AuditPanel", () => {
  it("renders all four tab buttons", async () => {
    renderWithI18n(<AuditPanel language="en" personnel={[]} />, "en");

    expect(screen.getByTestId("audit-tab-log")).toBeTruthy();
    expect(screen.getByTestId("audit-tab-personnel")).toBeTruthy();
    expect(screen.getByTestId("audit-tab-items")).toBeTruthy();
    expect(screen.getByTestId("audit-tab-alerts")).toBeTruthy();
  });

  it("marks the log tab as active by default", () => {
    renderWithI18n(<AuditPanel language="en" personnel={[]} />, "en");

    expect(screen.getByTestId("audit-tab-log").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("audit-tab-personnel").getAttribute("aria-selected")).toBe("false");
  });

  it("renders metric cards with summary labels", async () => {
    renderWithI18n(<AuditPanel language="en" personnel={[]} />, "en");

    await waitFor(() => {
      expect(screen.getByText("Total Movements")).toBeTruthy();
      expect(screen.getByText("Total Received")).toBeTruthy();
      expect(screen.getByText("Total Issued")).toBeTruthy();
      expect(screen.getByText("Items Affected")).toBeTruthy();
      expect(screen.getByText("Personnel Active")).toBeTruthy();
    });
  });
});
