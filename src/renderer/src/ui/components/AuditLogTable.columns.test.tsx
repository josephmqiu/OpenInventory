import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";
import { AuditLogTable } from "./AuditLogTable";
import type { AuditMovementFilters, AuditPageResult } from "../../domain/models";

// jsdom's opaque origin leaves localStorage undefined; useTableColumns guards
// reads/writes but the menu needs a working store to exercise show/hide here.
class MemStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});
afterEach(() => {
  cleanup();
  (globalThis as unknown as { localStorage?: MemStorage }).localStorage?.clear();
});

const baseFilters: AuditMovementFilters = {
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30",
  page: 1,
  pageSize: 50,
};

function makeData(): AuditPageResult {
  return {
    rows: [
      {
        id: "mov-1",
        itemId: "item-1",
        itemName: "Bolts M6",
        itemSku: "SKU-1",
        movementType: "receive",
        quantity: 50,
        previousQuantity: 100,
        newQuantity: 150,
        performedBy: "Alice",
        reason: "Restock",
        referenceNo: "PO-001",
        notes: "note",
        performedAt: "2026-04-22 10:00:00",
        isAnomaly: false,
      },
    ],
    total: 1,
    summary: {
      totalMovements: 1,
      totalReceived: 50,
      totalIssued: 0,
      uniqueItems: 1,
      uniquePersonnel: 1,
    },
  };
}

function renderTable(props: Partial<Parameters<typeof AuditLogTable>[0]> = {}) {
  return renderWithI18n(
    <AuditLogTable
      language="en"
      data={makeData()}
      filters={baseFilters}
      onPageChange={vi.fn()}
      onItemClick={vi.fn()}
      onQuickFilter={vi.fn()}
      onDeleteMovement={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />,
    "en",
  );
}

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: /Columns/ }));

describe("AuditLogTable configurable columns", () => {
  it("renders the Columns menu trigger", () => {
    renderTable();
    expect(screen.getByRole("button", { name: /Columns/ })).toBeTruthy();
  });

  it("hides a column when toggled off and restores it on reset", () => {
    renderTable();
    // 10 data columns + actions header = 11 column headers.
    expect(screen.getAllByRole("columnheader")).toHaveLength(11);

    openMenu();
    fireEvent.click(screen.getByRole("checkbox", { name: "Reason" }));
    expect(screen.getAllByRole("columnheader")).toHaveLength(10);

    fireEvent.click(screen.getByText("Reset to defaults"));
    expect(screen.getAllByRole("columnheader")).toHaveLength(11);
  });

  it("keeps the Actions column locked (always shown)", () => {
    renderTable();
    openMenu();
    const actions = screen.getByRole("checkbox", { name: /Actions/ }) as HTMLInputElement;
    expect(actions.checked).toBe(true);
    expect(actions.disabled).toBe(true);
  });

  it("clears the server sort when hiding the actively-sorted column", () => {
    const onQuickFilter = vi.fn();
    renderTable({
      filters: { ...baseFilters, sortBy: "reason", sortDir: "asc" },
      onQuickFilter,
    });
    openMenu();
    fireEvent.click(screen.getByRole("checkbox", { name: "Reason" }));
    expect(onQuickFilter).toHaveBeenCalledWith({ sortBy: undefined, sortDir: undefined });
  });

  it("does not clear the sort when hiding a different column", () => {
    const onQuickFilter = vi.fn();
    renderTable({
      filters: { ...baseFilters, sortBy: "reason", sortDir: "asc" },
      onQuickFilter,
    });
    openMenu();
    fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));
    expect(onQuickFilter).not.toHaveBeenCalled();
  });

  it("keeps the Columns menu mounted during loading", () => {
    renderTable({ loading: true, data: null });
    expect(screen.getByRole("button", { name: /Columns/ })).toBeTruthy();
    expect(screen.getByText("Loading audit data...")).toBeTruthy();
  });

  it("keeps the Columns menu mounted on the empty state", () => {
    renderTable({
      data: { rows: [], total: 0, summary: makeData().summary },
      emptyTitle: "No movements recorded yet.",
      emptyHint: "Receive or issue inventory to see activity here.",
    });
    expect(screen.getByRole("button", { name: /Columns/ })).toBeTruthy();
    expect(screen.getByText("No movements recorded yet.")).toBeTruthy();
  });
});
