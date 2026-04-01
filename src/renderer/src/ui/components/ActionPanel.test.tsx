import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "../../app/i18n";
import type { InventoryItem, PersonnelMember } from "../../domain/models";
import { ActionPanel } from "./ActionPanel";

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

function renderPanel(overrides: Partial<ComponentProps<typeof ActionPanel>> = {}) {
  const props: ComponentProps<typeof ActionPanel> = {
    action: "createItem",
    activeItemId: "",
    busy: false,
    dictionary,
    language: "en",
    items: [item],
    personnel,
    onClose: vi.fn(),
    onCreateItem: vi.fn().mockResolvedValue(undefined),
    onUpdateItem: vi.fn().mockResolvedValue(undefined),
    onReceiveStock: vi.fn().mockResolvedValue(undefined),
    onIssueMaterial: vi.fn().mockResolvedValue(undefined),
    onRemoveItem: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    ...overrides,
  };

  render(<ActionPanel {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
});

describe("ActionPanel", () => {
  it("reports a validation error instead of submitting an invalid item update", async () => {
    const props = renderPanel({
      action: "modifyItem",
      activeItemId: item.id,
    });

    const nameInput = screen.getByRole("textbox", { name: /Item Name/ }) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: dictionary.modifyItem }));

    await waitFor(() => {
      expect(props.onError).toHaveBeenCalledWith(dictionary.formValidationError);
    });
    expect(props.onUpdateItem).not.toHaveBeenCalled();
  });

  it("submits stock receipts with the selected item, quantity, and personnel", async () => {
    const props = renderPanel({
      action: "receiveStock",
      activeItemId: item.id,
    });

    await waitFor(() => {
      expect((screen.getByRole("combobox", { name: /Performed By/ }) as HTMLSelectElement).value).toBe("Alice");
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity/ }), { target: { value: "7" } });
    fireEvent.change(screen.getByRole("textbox", { name: dictionary.reason }), { target: { value: "Cycle count" } });
    fireEvent.click(screen.getByRole("button", { name: dictionary.save }));

    await waitFor(() => {
      expect(props.onReceiveStock).toHaveBeenCalledWith({
        itemId: item.id,
        quantity: 7,
        reason: "Cycle count",
        performedBy: "Alice",
      });
    });
  });

  it("submits item removal for the selected item", async () => {
    const props = renderPanel({
      action: "removeItem",
      activeItemId: item.id,
    });

    fireEvent.click(screen.getByRole("button", { name: dictionary.removeItem }));

    await waitFor(() => {
      expect(props.onRemoveItem).toHaveBeenCalledWith(item.id);
    });
  });
});
