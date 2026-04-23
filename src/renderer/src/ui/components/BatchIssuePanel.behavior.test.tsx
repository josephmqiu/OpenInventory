import type { ComponentProps } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryItem, Language, PersonnelMember } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { BatchIssuePanel } from "./BatchIssuePanel";

const items: InventoryItem[] = [
  {
    id: "item-1",
    sku: "SKU-BOLTS-M6",
    qrCodeDataUrl: "",
    name: "Bolts M6",
    category: "Fasteners",
    location: "Shelf A",
    unit: "pcs",
    supplier: "Acme",
    currentQuantity: 100,
    reorderQuantity: 20,
    status: "in_stock",
    lastUpdated: "2026-04-03T08:00:00Z",
  },
  {
    id: "item-2",
    sku: "SKU-WASHERS-M6",
    qrCodeDataUrl: "",
    name: "Washers M6",
    category: "Fasteners",
    location: "Shelf B",
    unit: "pcs",
    supplier: "Acme",
    currentQuantity: 8,
    reorderQuantity: 10,
    status: "low_stock",
    lastUpdated: "2026-04-03T08:00:00Z",
  },
];

const personnel: PersonnelMember[] = [
  { id: "person-1", name: "Alice" },
  { id: "person-2", name: "Bob" },
];

function renderPanel(overrides: Partial<ComponentProps<typeof BatchIssuePanel>> = {}) {
  const props: ComponentProps<typeof BatchIssuePanel> = {
    busy: false,
    errorMessage: null,
    items,
    language: "en" as Language,
    personnel,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(true),
    ...overrides,
  };

  renderWithI18n(<BatchIssuePanel {...props} />, props.language);
  return props;
}

afterEach(() => {
  cleanup();
});

describe("BatchIssuePanel", () => {
  it("submits only positive quantities and defaults performedBy to the first personnel member", async () => {
    const props = renderPanel();
    // Get all textboxes and filter out the Reason input
    const allTextboxes = screen.getAllByRole("textbox");
    const quantityInputs = allTextboxes.filter(input => input.name !== "Reason");

    fireEvent.change(quantityInputs[0], { target: { value: "5" } });
    fireEvent.change(quantityInputs[1], { target: { value: "0" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Cycle count" },
    });
    fireEvent.click(screen.getByTestId("batch-submit"));

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith({
        items: [{ itemId: "item-1", quantity: 5 }],
        performedBy: "Alice",
        reason: "Cycle count",
      });
    });
  });

  it("shows a validation error instead of submitting when no quantities are entered", async () => {
    const props = renderPanel();

    fireEvent.click(screen.getByTestId("batch-submit"));

    await waitFor(() => {
      expect(screen.getByText("Check the required fields and quantity values.")).toBeTruthy();
    });
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("shows success feedback and clears quantities after a successful submit", async () => {
    const props = renderPanel();
    // Get all textboxes and filter out the Reason input
    const allTextboxes = screen.getAllByRole("textbox");
    const quantityInput = allTextboxes.filter(input => input.name !== "Reason")[0] as HTMLInputElement;

    fireEvent.change(quantityInput, { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("batch-submit"));

    await waitFor(() => {
      expect(screen.getByText("Batch material issue recorded."));
    });
    expect(quantityInput.value).toBe("");
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it("blocks issuing when no personnel are configured", () => {
    renderPanel({ personnel: [] });

    expect(
      screen.getByText("No personnel configured. Add personnel in the desktop app before issuing material."),
    ).toBeTruthy();
    expect((screen.getByTestId("batch-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onClose from either cancel button", () => {
    const props = renderPanel();
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });

    fireEvent.click(cancelButtons[0]);
    fireEvent.click(cancelButtons[1]);

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
