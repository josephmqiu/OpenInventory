import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryItem } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { UnifiedInventoryTable } from "./UnifiedInventoryTable";

// Mock gateway functions used by the component tree
vi.mock("../../services/inventoryGateway", () => ({
  getItemMovements: vi.fn().mockResolvedValue([]),
  exportQrLabel: vi.fn().mockResolvedValue(null),
  exportSelectedQrLabels: vi.fn().mockResolvedValue(null),
}));

// Mock QrCodeImage to avoid qrcode library dependency
vi.mock("./QrCodeImage", () => ({
  QrCodeImage: ({ alt }: { alt: string }) => <span data-testid="qr-code">{alt}</span>,
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
    status: "out_of_stock",
    lastUpdated: "2026-03-29T08:00:00Z",
  },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof UnifiedInventoryTable>> = {}) {
  const props: React.ComponentProps<typeof UnifiedInventoryTable> = {
    busy: false,
    language: "en",
    items,
    filter: "all",
    onFilterChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    detailItemId: "",
    onDetailItemIdChange: vi.fn(),
    onAction: vi.fn(),
    onBatchIssue: vi.fn(),
    onError: vi.fn(),
    onNotice: vi.fn(),
    ...overrides,
  };

  renderWithI18n(<UnifiedInventoryTable {...props} />, props.language);
  return props;
}

afterEach(cleanup);

describe("UnifiedInventoryTable", () => {
  it("renders all items in the table", () => {
    renderTable();

    expect(screen.getByText("Bolts M6")).toBeTruthy();
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.getByText("Washers")).toBeTruthy();
  });

  it("renders SKU and location columns", () => {
    renderTable();

    expect(screen.getByText("SKU-001")).toBeTruthy();
    // Two items share "Warehouse A" so use getAllByText
    expect(screen.getAllByText("Warehouse A").length).toBe(2);
    expect(screen.getByText("Warehouse B")).toBeTruthy();
  });

  it("shows filter tab counts", () => {
    renderTable();

    const tabs = document.querySelectorAll(".filter-tab");
    // All tab should show total count
    const allTabCount = tabs[0]?.querySelector(".filter-tab__count");
    expect(allTabCount?.textContent).toBe("3");

    // Low Stock tab
    const lowTabCount = tabs[1]?.querySelector(".filter-tab__count");
    expect(lowTabCount?.textContent).toBe("1");

    // Out of Stock tab
    const oosTabCount = tabs[2]?.querySelector(".filter-tab__count");
    expect(oosTabCount?.textContent).toBe("1");
  });

  it("calls onFilterChange when a filter tab is clicked", () => {
    const props = renderTable();

    const tabs = document.querySelectorAll(".filter-tab");
    fireEvent.click(tabs[1]); // Low Stock tab
    expect(props.onFilterChange).toHaveBeenCalledWith("low_stock");
  });

  it("filters items by low_stock status", () => {
    renderTable({ filter: "low_stock" });

    expect(screen.queryByText("Bolts M6")).toBeNull();
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.queryByText("Washers")).toBeNull();
  });

  it("filters items by out_of_stock status", () => {
    renderTable({ filter: "out_of_stock" });

    expect(screen.queryByText("Bolts M6")).toBeNull();
    expect(screen.queryByText("Nuts M8")).toBeNull();
    expect(screen.getByText("Washers")).toBeTruthy();
  });

  it("calls onDetailItemIdChange when a row is clicked", () => {
    const props = renderTable();

    fireEvent.click(screen.getByText("Bolts M6"));
    expect(props.onDetailItemIdChange).toHaveBeenCalledWith("item-1");
  });

  it("shows empty state when items array is empty", () => {
    renderTable({ items: [] });

    expect(screen.getByText("No inventory records yet.")).toBeTruthy();
  });

  it("shows filtered-empty message for low stock when no items match", () => {
    const inStockOnly: InventoryItem[] = [
      { ...items[0], status: "in_stock" },
    ];
    renderTable({ items: inStockOnly, filter: "low_stock" });

    expect(screen.getByText("All items are above reorder levels.")).toBeTruthy();
  });

  it("shows search hint when search yields no results", () => {
    renderTable({ search: "nonexistent" });

    expect(screen.getByText(/No items match/)).toBeTruthy();
  });

  it("filters items by search text (name match)", () => {
    renderTable({ search: "Bolts" });

    expect(screen.getByText("Bolts M6")).toBeTruthy();
    expect(screen.queryByText("Nuts M8")).toBeNull();
    expect(screen.queryByText("Washers")).toBeNull();
  });

  it("filters items by search text (SKU match)", () => {
    renderTable({ search: "SKU-002" });

    expect(screen.queryByText("Bolts M6")).toBeNull();
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.queryByText("Washers")).toBeNull();
  });

  it("filters items by search text (location match)", () => {
    renderTable({ search: "Warehouse B" });

    expect(screen.queryByText("Bolts M6")).toBeNull();
    expect(screen.getByText("Nuts M8")).toBeTruthy();
    expect(screen.queryByText("Washers")).toBeNull();
  });

  it("renders action buttons for each row", () => {
    renderTable();

    // Each row has Recv and Issue buttons
    expect(screen.getByTestId("issue-btn-SKU-001")).toBeTruthy();
    expect(screen.getByTestId("issue-btn-SKU-002")).toBeTruthy();
  });

  it("shows selection bar with batch actions when items are selected", () => {
    const { container } = renderTable();

    // Click a checkbox to select an item
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // First row checkbox

    expect(screen.getByText(/1 selected/)).toBeTruthy();
    expect(screen.getByText("Batch Issue")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
  });

  it("calls onSearchChange when search input changes", () => {
    const props = renderTable();

    const searchInput = screen.getByRole("search");
    fireEvent.change(searchInput, { target: { value: "test" } });

    expect(props.onSearchChange).toHaveBeenCalledWith("test");
  });
});
