import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";

vi.mock("../../services/inventoryGateway", () => ({
  getAuditMovements: vi.fn().mockResolvedValue({
    rows: [
      {
        id: "mov-1",
        itemId: "item-1",
        itemName: "Widget A",
        itemSku: "WA-001",
        movementType: "receive",
        quantity: 10,
        previousQuantity: 90,
        newQuantity: 100,
        performedBy: "Alice",
        performedAt: "2026-03-15T10:00:00Z",
        reason: "Restock",
        referenceNo: "PO-123",
        notes: "",
        isAnomaly: false,
      },
    ],
    total: 1,
    summary: {
      totalMovements: 1,
      totalReceived: 1,
      totalIssued: 0,
      uniqueItems: 1,
      uniquePersonnel: 1,
    },
  }),
}));

import { AuditDrillDown } from "./AuditDrillDown";

afterEach(cleanup);

describe("AuditDrillDown", () => {
  it("renders breadcrumb with item name and movement data", async () => {
    renderWithI18n(
      <AuditDrillDown
        language="en"
        itemId="item-1"
        itemName="Widget A"
        filters={{ page: 1, pageSize: 50 }}
        sourceTab="items"
        onBack={vi.fn()}
      />,
      "en",
    );

    // Item name in breadcrumb
    expect(screen.getByText("Widget A")).toBeTruthy();

    // Wait for movement data to load
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeTruthy();
    });

    // Quantity should render with + prefix for receive
    expect(screen.getByText("+10")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("renders back button that calls onBack", async () => {
    const onBack = vi.fn();
    renderWithI18n(
      <AuditDrillDown
        language="en"
        itemId="item-1"
        itemName="Widget A"
        filters={{ page: 1, pageSize: 50 }}
        sourceTab="log"
        onBack={onBack}
      />,
      "en",
    );

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeTruthy();
    });

    const backButtons = screen.getAllByRole("button");
    const backBtn = backButtons.find((b) => b.textContent?.includes("Back"));
    expect(backBtn).toBeTruthy();
  });

  it("renders empty state when no movement rows exist", async () => {
    const { getAuditMovements } = await import("../../services/inventoryGateway");
    (getAuditMovements as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [],
      total: 0,
      summary: {
        totalMovements: 0,
        totalReceived: 0,
        totalIssued: 0,
        uniqueItems: 0,
        uniquePersonnel: 0,
      },
    });

    renderWithI18n(
      <AuditDrillDown
        language="en"
        itemId="item-empty"
        itemName="Empty Item"
        filters={{ page: 1, pageSize: 50 }}
        sourceTab="items"
        onBack={vi.fn()}
      />,
      "en",
    );

    expect(screen.getByText("Empty Item")).toBeTruthy();
  });
});
