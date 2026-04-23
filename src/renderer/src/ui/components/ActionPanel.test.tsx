import type { ComponentProps } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryItem, Language, PersonnelMember } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { ActionPanel } from "./ActionPanel";

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
    language: "en" as Language,
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

  renderWithI18n(<ActionPanel {...props} />, props.language);
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
    fireEvent.click(screen.getByRole("button", { name: "Modify Item" }));

    await waitFor(() => {
      expect(props.onError).toHaveBeenCalledWith("Check the required fields and quantity values.");
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

    fireEvent.change(screen.getByRole("textbox", { name: /Quantity/ }), { target: { value: "7" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Cycle count" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Remove Item" }));

    await waitFor(() => {
      expect(props.onRemoveItem).toHaveBeenCalledWith(item.id);
    });
  });

  it("renders category and unit input fields for first item creation", async () => {
    renderPanel({
      items: [],
    });

    // For first item, should show direct input fields for category and unit
    await screen.findByRole("textbox", { name: /Category/ });
    await screen.findByRole("textbox", { name: /Unit/ });
  });

  it("renders category and unit select dropdowns when items exist", async () => {
    renderPanel({
      items: [item],
    });

    // When items exist, should show select dropdowns
    await screen.findByRole("combobox", { name: /Category/ });
    await screen.findByRole("combobox", { name: /Unit/ });
  });

  it("allows creating first item with custom category and unit", async () => {
    const props = renderPanel({
      items: [],
    });

    // Fill form
    fireEvent.change(screen.getByRole("textbox", { name: /Item Name/ }), { target: { value: "New Item" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Category/ }), { target: { value: "New Category" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Location/ }), { target: { value: "Warehouse A" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Unit/ }), { target: { value: "units" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reorder Level/ }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Initial Quantity/ }), { target: { value: "20" } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Verify form submission
    await waitFor(() => {
      expect(props.onCreateItem).toHaveBeenCalledWith({
        sku: "",
        name: "New Item",
        category: "New Category",
        location: "Warehouse A",
        unit: "units",
        supplier: "",
        reorderQuantity: 10,
        initialQuantity: 20,
      });
    });
  });

  it("allows creating second item with existing category and unit", async () => {
    // Create first item
    const firstItem: InventoryItem = {
      ...item,
      id: "item-1",
      category: "New Category",
      unit: "units",
    };

    const props = renderPanel({
      items: [firstItem],
    });

    // Fill form
    fireEvent.change(screen.getByRole("textbox", { name: /Item Name/ }), { target: { value: "Second Item" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Category/ }), { target: { value: "New Category" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Location/ }), { target: { value: "Warehouse A" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Unit/ }), { target: { value: "units" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reorder Level/ }), { target: { value: "5" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Initial Quantity/ }), { target: { value: "15" } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Verify form submission
    await waitFor(() => {
      expect(props.onCreateItem).toHaveBeenCalledWith({
        sku: "",
        name: "Second Item",
        category: "New Category",
        location: "Warehouse A",
        unit: "units",
        supplier: "",
        reorderQuantity: 5,
        initialQuantity: 15,
      });
    });
  });

  it("shows validation error for empty required fields", async () => {
    const props = renderPanel({
      items: [],
    });

    // Submit form with empty fields
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Verify error
    await waitFor(() => {
      expect(props.onError).toHaveBeenCalledWith("Check the required fields and quantity values.");
    });
    expect(props.onCreateItem).not.toHaveBeenCalled();
  });

  it("shows validation error for negative quantities", async () => {
    const props = renderPanel({
      items: [],
    });

    // Fill form with negative quantities
    fireEvent.change(screen.getByRole("textbox", { name: /Item Name/ }), { target: { value: "Test Item" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Category/ }), { target: { value: "Test Category" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Location/ }), { target: { value: "Warehouse A" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Unit/ }), { target: { value: "units" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reorder Level/ }), { target: { value: "-5" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Initial Quantity/ }), { target: { value: "-10" } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Verify error
    await waitFor(() => {
      expect(props.onError).toHaveBeenCalledWith("Check the required fields and quantity values.");
    });
    expect(props.onCreateItem).not.toHaveBeenCalled();
  });

  it("allows adding new category when creating item", async () => {
    const props = renderPanel({
      items: [item],
    });

    // Select "Add New Category" option
    const categorySelect = screen.getByRole("combobox", { name: /Category/ });
    fireEvent.change(categorySelect, { target: { value: "__new__" } });

    // Enter new category name
    const newCategoryInput = screen.getByRole("textbox", { name: /New Category Name/ });
    fireEvent.change(newCategoryInput, { target: { value: "Brand New Category" } });

    // Fill other fields
    fireEvent.change(screen.getByRole("textbox", { name: /Item Name/ }), { target: { value: "Test Item" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Location/ }), { target: { value: "Warehouse A" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reorder Level/ }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Initial Quantity/ }), { target: { value: "20" } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Verify form submission with new category
    await waitFor(() => {
      expect(props.onCreateItem).toHaveBeenCalledWith({
        sku: "",
        name: "Test Item",
        category: "Brand New Category",
        location: "Warehouse A",
        unit: "pcs",
        supplier: "",
        reorderQuantity: 10,
        initialQuantity: 20,
      });
    });
  });

  it("allows adding new unit when creating item", async () => {
    const props = renderPanel({
      items: [item],
    });

    // Select "Add New Unit" option
    const unitSelect = screen.getByRole("combobox", { name: /Unit/ });
    fireEvent.change(unitSelect, { target: { value: "__new_unit__" } });

    // Enter new unit name
    const newUnitInput = screen.getByRole("textbox", { name: /New Unit Name/ });
    fireEvent.change(newUnitInput, { target: { value: "new_units" } });

    // Fill other fields
    fireEvent.change(screen.getByRole("textbox", { name: /Item Name/ }), { target: { value: "Test Item" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Location/ }), { target: { value: "Warehouse A" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reorder Level/ }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Initial Quantity/ }), { target: { value: "20" } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Verify form submission with new unit
    await waitFor(() => {
      expect(props.onCreateItem).toHaveBeenCalledWith({
        sku: "",
        name: "Test Item",
        category: "Parts",
        location: "Warehouse A",
        unit: "new_units",
        supplier: "",
        reorderQuantity: 10,
        initialQuantity: 20,
      });
    });
  });
});
