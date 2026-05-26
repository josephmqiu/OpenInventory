import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "i18next";
import { QuickItemList } from "./QuickItemList";
import type { PublicCatalogItem } from "../../../shared/types";
import type { InventoryStatusFilter } from "../domain/itemFilter";

afterEach(cleanup);

function makeItem(overrides: Partial<PublicCatalogItem> = {}): PublicCatalogItem {
  return {
    id: "item-1",
    sku: "SKU-001",
    name: "Test Item",
    category: "chemicals",
    location: "B-12",
    unit: "pieces",
    supplier: "ACME",
    currentQuantity: 100,
    reorderQuantity: 10,
    unitPriceMinor: null,
    status: "in_stock",
    lastUpdated: "2026-03-31",
    ...overrides,
  };
}

const items: PublicCatalogItem[] = [
  makeItem({ id: "a", sku: "BOLT-M8", name: "Steel Bolt M8", location: "A1-03", status: "in_stock" }),
  makeItem({ id: "b", sku: "LABEL-ROLL", name: "Barcode Label Roll", location: "E1-11", currentQuantity: 5, status: "low_stock" }),
  makeItem({ id: "c", sku: "EMPTY-1", name: "Empty Bin", location: "Z9-00", currentQuantity: 0, status: "out_of_stock" }),
];

function renderList(props: Partial<React.ComponentProps<typeof QuickItemList>> = {}) {
  const onSelectItem = vi.fn();
  const onSearchChange = vi.fn();
  const onFilterChange = vi.fn();
  const onRefresh = vi.fn();
  const { container } = render(
    <QuickItemList
      items={items}
      language="en"
      search=""
      filter="all"
      onSelectItem={onSelectItem}
      onSearchChange={onSearchChange}
      onFilterChange={onFilterChange}
      onRefresh={onRefresh}
      {...props}
    />,
  );
  return { container, onSelectItem, onSearchChange, onFilterChange, onRefresh };
}

const renderListWithContainer = renderList;

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("QuickItemList", () => {
  it("renders a row per item and the total count", () => {
    renderList();
    expect(screen.getAllByTestId("qi-list-row")).toHaveLength(3);
    expect(screen.getByText("Steel Bolt M8")).toBeDefined();
  });

  it("filters by the search prop (name / SKU / location)", () => {
    renderList({ search: "label" });
    const rows = screen.getAllByTestId("qi-list-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Barcode Label Roll");
  });

  it("filters by the status filter prop", () => {
    renderList({ filter: "out_of_stock" });
    const rows = screen.getAllByTestId("qi-list-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Empty Bin");
  });

  it("calls onSelectItem with the item id when a row is tapped", () => {
    const { onSelectItem } = renderList();
    fireEvent.click(screen.getByText("Steel Bolt M8"));
    expect(onSelectItem).toHaveBeenCalledWith("a");
  });

  it("calls onSearchChange as the user types", () => {
    const { onSearchChange } = renderList();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bolt" } });
    expect(onSearchChange).toHaveBeenCalledWith("bolt");
  });

  it("calls onFilterChange when a status chip is clicked", () => {
    const { container, onFilterChange } = renderListWithContainer();
    const chips = [...container.querySelectorAll<HTMLButtonElement>(".qi-list__chip")];
    const lowChip = chips.find((c) => /low/i.test(c.textContent ?? ""));
    expect(lowChip).toBeDefined();
    fireEvent.click(lowChip!);
    expect(onFilterChange).toHaveBeenCalledWith("low_stock" satisfies InventoryStatusFilter);
  });

  it("shows the empty-catalog message when there are no items", () => {
    render(
      <QuickItemList
        items={[]}
        language="en"
        search=""
        filter="all"
        onSelectItem={vi.fn()}
        onSearchChange={vi.fn()}
        onFilterChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText(/no items in inventory/i)).toBeDefined();
    expect(screen.queryAllByTestId("qi-list-row")).toHaveLength(0);
  });

  it("shows the no-search-match message when the search matches nothing", () => {
    renderList({ search: "zzz-nope" });
    expect(screen.getByText(/no items match/i)).toBeDefined();
  });

  it("shows a 'Show all' reset when a status filter matches nothing", () => {
    const inStockOnly = [makeItem({ id: "x", status: "in_stock" })];
    const onFilterChange = vi.fn();
    render(
      <QuickItemList
        items={inStockOnly}
        language="en"
        search=""
        filter="out_of_stock"
        onSelectItem={vi.fn()}
        onSearchChange={vi.fn()}
        onFilterChange={onFilterChange}
        onRefresh={vi.fn()}
      />,
    );
    const showAll = screen.getByText(/show all/i);
    fireEvent.click(showAll);
    expect(onFilterChange).toHaveBeenCalledWith("all" satisfies InventoryStatusFilter);
  });
});
