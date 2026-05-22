import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickIssueMobile } from "./QuickIssueMobile";
import type { InventoryItem, PersonnelMember } from "../../../shared/types";
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
    unitPriceMinor: null,
    status: "in_stock",
    lastUpdated: "2026-03-31",
    ...overrides,
  };
}

const personnel: PersonnelMember[] = [
  { id: "p1", name: "Chen Jun" },
  { id: "p2", name: "Li Ming" },
];

describe("QuickIssueMobile", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders item name, SKU, category, location, and current qty", () => {
    render(
      <QuickIssueMobile
        busy={false}
        item={makeItem()}
        language="en"
        currency="CNY"
        personnel={personnel}
        onIssue={vi.fn()}
      />,
    );
    expect(screen.getByText("Test Item")).toBeDefined();
    expect(screen.getByText("SKU-001")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
  });

  it("preset +1 sets quantity to 1", () => {
    render(
      <QuickIssueMobile busy={false} item={makeItem()} language="en" currency="CNY" personnel={personnel} onIssue={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("+1"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("1");
  });

  it("presets are cumulative: +5 then +10 = 15", () => {
    render(
      <QuickIssueMobile busy={false} item={makeItem()} language="en" currency="CNY" personnel={personnel} onIssue={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("+5"));
    fireEvent.click(screen.getByText("+10"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("15");
  });

  it("preset caps at currentQuantity", () => {
    render(
      <QuickIssueMobile busy={false} item={makeItem({ currentQuantity: 3 })} language="en" currency="CNY" personnel={personnel} onIssue={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("+5"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("3");
  });

  it("clear button resets quantity to empty", () => {
    render(
      <QuickIssueMobile busy={false} item={makeItem()} language="en" currency="CNY" personnel={personnel} onIssue={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("+5"));
    fireEvent.click(screen.getByText("Clear"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("disables presets and submit when zero stock", () => {
    render(
      <QuickIssueMobile busy={false} item={makeItem({ currentQuantity: 0 })} language="en" currency="CNY" personnel={personnel} onIssue={vi.fn()} />,
    );
    const presetButtons = screen.getAllByRole("button").filter((b) => b.textContent?.startsWith("+"));
    for (const btn of presetButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
    const submitBtn = screen.getByRole("button", { name: /issue material/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables submit when no personnel", () => {
    render(
      <QuickIssueMobile busy={false} item={makeItem()} language="en" currency="CNY" personnel={[]} onIssue={vi.fn()} />,
    );
    expect(screen.getByText("No personnel configured. Add personnel in the desktop app before issuing material.")).toBeDefined();
  });

  it("calls onIssue with correct input on submit", async () => {
    const onIssue = vi.fn().mockResolvedValue("Success");
    render(
      <QuickIssueMobile busy={false} item={makeItem()} language="en" currency="CNY" personnel={personnel} onIssue={onIssue} />,
    );
    fireEvent.click(screen.getByText("+5"));
    fireEvent.click(screen.getByRole("button", { name: /issue material/i }));

    await vi.waitFor(() => expect(onIssue).toHaveBeenCalledOnce());
    expect(onIssue).toHaveBeenCalledWith({
      itemId: "item-1",
      quantity: 5,
      performedBy: "Chen Jun",
      reason: "QR issue",
    });
  });
});
