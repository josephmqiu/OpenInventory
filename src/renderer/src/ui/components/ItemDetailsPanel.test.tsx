import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryItem } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { ItemDetailsPanel } from "./ItemDetailsPanel";

// Mock the gateway to avoid real IPC calls
vi.mock("../../services/inventoryGateway", () => ({
  getItemMovements: vi.fn().mockResolvedValue([]),
  exportQrLabel: vi.fn().mockResolvedValue(null),
}));

// Mock QrCodeImage to avoid qrcode library dependency in tests
vi.mock("./QrCodeImage", () => ({
  QrCodeImage: ({ alt }: { alt: string }) => <span data-testid="qr-code">{alt}</span>,
}));

const item: InventoryItem = {
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
  unitPriceMinor: null,
  status: "in_stock",
  lastUpdated: "2026-03-31T10:00:00Z",
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof ItemDetailsPanel>> = {}) {
  const props: React.ComponentProps<typeof ItemDetailsPanel> = {
    language: "en",
    currency: "CNY",
    item,
    onBack: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };

  const result = renderWithI18n(<ItemDetailsPanel {...props} />, props.language);
  return { ...result, props };
}

afterEach(cleanup);

describe("ItemDetailsPanel", () => {
  it("renders item name and SKU", () => {
    const { container } = renderPanel();

    // SKU appears in the detail table cell and possibly in QrCodeImage alt
    const skuCell = container.querySelector("td.cell-mono");
    expect(skuCell?.textContent).toBe("SKU-001");
    expect(screen.getByText("Bolts M6")).toBeTruthy();
  });

  it("renders item details (location, supplier, unit)", () => {
    renderPanel();

    expect(screen.getByText("Warehouse A")).toBeTruthy();
    expect(screen.getByText("Fasteners Inc.")).toBeTruthy();
  });

  it("renders current quantity and reorder level", () => {
    renderPanel();

    expect(screen.getByText("150")).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
  });

  it("renders the QR code when qrCodeDataUrl is present", () => {
    renderPanel();

    expect(screen.getByTestId("qr-code")).toBeTruthy();
  });

  it("shows unavailable message when qrCodeDataUrl is empty", () => {
    renderPanel({
      item: { ...item, qrCodeDataUrl: "" },
    });

    // The i18n key "qrCodeUnavailable" resolves to "QR code unavailable."
    expect(screen.getByText("QR code unavailable.")).toBeTruthy();
  });

  it("calls onBack when back button is clicked", () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByText("Back To List"));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it("calls onExport when export button is clicked", () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByTestId("item-export-qr-label"));
    expect(props.onExport).toHaveBeenCalledOnce();
  });

  it("disables export button when qrCodeDataUrl is empty", () => {
    renderPanel({ item: { ...item, qrCodeDataUrl: "" } });

    const exportBtn = screen.getByTestId("item-export-qr-label") as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
  });

  it("renders modify button when onModifyItem is provided", () => {
    const onModifyItem = vi.fn();
    renderPanel({ onModifyItem });

    const modifyBtn = screen.getByText("Modify Item");
    fireEvent.click(modifyBtn);
    expect(onModifyItem).toHaveBeenCalledWith("item-1");
  });

  it("does not render modify button when onModifyItem is absent", () => {
    renderPanel();

    expect(screen.queryByText("Modify Item")).toBeNull();
  });

  it("renders remove button when onRemoveItem is provided", () => {
    const onRemoveItem = vi.fn();
    renderPanel({ onRemoveItem });

    const removeBtn = screen.getByText("Remove Item");
    fireEvent.click(removeBtn);
    expect(onRemoveItem).toHaveBeenCalledWith("item-1");
  });

  it("does not render remove button when onRemoveItem is absent", () => {
    renderPanel();

    expect(screen.queryByText("Remove Item")).toBeNull();
  });

  it("renders the panel container with the correct test id", () => {
    renderPanel();

    expect(screen.getByTestId("item-details-panel")).toBeTruthy();
  });

  it("shows supplier as 'Not provided' when supplier is empty", () => {
    renderPanel({
      item: { ...item, supplier: "" },
    });

    // The "Not provided" text appears for empty supplier
    expect(screen.getAllByText("Not provided").length).toBeGreaterThanOrEqual(1);
  });
});
