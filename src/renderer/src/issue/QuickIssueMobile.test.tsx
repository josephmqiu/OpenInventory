import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickIssueMobile } from "./QuickIssueMobile";
import type { InventoryItem } from "../../../shared/types";
import i18n from "i18next";

afterEach(cleanup);

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    sku: "SKU-001",
    qrCodeDataUrl: "",
    name: "Test Item",
    category: "chemicals",
    location: "B-12",
    unit: "pieces",
    supplier: "ACME",
    currentQuantity: 100,
    reorderQuantity: 10,
    status: "in_stock",
    lastUpdated: "2026-03-31",
    ...overrides,
  };
}

describe("QuickIssueMobile (read-only lookup)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders item name, SKU, current qty, location, and supplier", () => {
    render(<QuickIssueMobile item={makeItem()} language="en" onRefresh={vi.fn()} />);
    expect(screen.getByText("Test Item")).toBeDefined();
    expect(screen.getByText("SKU-001")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
    expect(screen.getByText("B-12")).toBeDefined();
    expect(screen.getByText("ACME")).toBeDefined();
  });

  it("does not render any stock-mutation controls", () => {
    render(<QuickIssueMobile item={makeItem()} language="en" onRefresh={vi.fn()} />);
    // No quantity input, no preset buttons, no issue/submit button.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("+5")).toBeNull();
    expect(screen.queryByRole("button", { name: /issue material/i })).toBeNull();
  });

  it("shows an out-of-stock badge when quantity is zero", () => {
    render(<QuickIssueMobile item={makeItem({ currentQuantity: 0 })} language="en" onRefresh={vi.fn()} />);
    expect(screen.getByText(/out of stock/i)).toBeDefined();
  });

  it("calls onRefresh when the refresh button is clicked", () => {
    const onRefresh = vi.fn();
    render(<QuickIssueMobile item={makeItem()} language="en" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTestId("qi-refresh"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
