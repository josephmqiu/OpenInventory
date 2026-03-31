import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "../../app/i18n";
import type { InventoryItem, PersonnelMember } from "../../domain/models";
import { QuickIssuePage } from "./QuickIssuePage";

const dictionary = dictionaries.en;
const item: InventoryItem = {
  id: "item-1",
  sku: "SKU-001",
  qrCodeDataUrl: "http://127.0.0.1:4123/issue/item-1",
  name: "Bolts M6",
  category: "Parts",
  location: "Warehouse A",
  unit: "pcs",
  supplier: "Fasteners Inc.",
  currentQuantity: 15,
  reorderQuantity: 10,
  status: "in_stock",
  lastUpdated: "2026-03-31T10:00:00Z",
};
const personnel: PersonnelMember[] = [{ id: "person-1", name: "Alice" }];

afterEach(() => {
  cleanup();
});

describe("QuickIssuePage", () => {
  it("keeps the issue button disabled until the quantity is valid", () => {
    render(
      <QuickIssuePage
        busy={false}
        dictionary={dictionary}
        item={item}
        language="en"
        personnel={personnel}
        onIssue={vi.fn().mockResolvedValue(dictionary.successIssueMaterial)}
      />,
    );

    const quantityInput = screen.getByRole("spinbutton", { name: /Quantity/ }) as HTMLInputElement;
    const submitButton = screen.getByRole("button", { name: dictionary.issueMaterial }) as HTMLButtonElement;

    expect(submitButton.disabled).toBe(true);

    fireEvent.change(quantityInput, { target: { value: "20" } });
    expect(submitButton.disabled).toBe(true);

    fireEvent.change(quantityInput, { target: { value: "5" } });
    expect(submitButton.disabled).toBe(false);
  });

  it("submits a quick issue and resets the quantity input on success", async () => {
    const onIssue = vi.fn().mockResolvedValue(dictionary.successIssueMaterial);
    render(
      <QuickIssuePage
        busy={false}
        dictionary={dictionary}
        item={item}
        language="en"
        personnel={personnel}
        onIssue={onIssue}
      />,
    );

    const quantityInput = screen.getByRole("spinbutton", { name: /Quantity/ }) as HTMLInputElement;
    fireEvent.change(quantityInput, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: dictionary.issueMaterial }));

    await waitFor(() => {
      expect(onIssue).toHaveBeenCalledWith({
        itemId: item.id,
        quantity: 4,
        performedBy: "Alice",
        reason: dictionary.qrIssueReason,
      });
    });
    await waitFor(() => {
      expect(quantityInput.value).toBe("");
      expect(screen.getByText(dictionary.successIssueMaterial)).toBeTruthy();
    });
  });

  it("localizes backend errors from a failed quick issue", async () => {
    render(
      <QuickIssuePage
        busy={false}
        dictionary={dictionary}
        item={item}
        language="en"
        personnel={personnel}
        onIssue={vi.fn().mockRejectedValue(new Error("Cannot issue 50 units. Current available stock is 5."))}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity/ }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: dictionary.issueMaterial }));

    await waitFor(() => {
      expect(screen.getByText(dictionary.insufficientStockError(50, 5))).toBeTruthy();
    });
  });
});
