import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryItem } from "../../domain/models";
import { buildQrLabelExportPayload, renderQrLabelPng } from "./qrLabelExport";

const { toCanvas } = vi.hoisted(() => ({
  toCanvas: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: {
    toCanvas,
  },
}));

const baseItem: InventoryItem = {
  id: "item-1",
  sku: "SKU-BOLTS-M6",
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

describe("qrLabelExport", () => {
  const originalCreateElement = document.createElement.bind(document);
  const fillText = vi.fn();
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const strokeRect = vi.fn();

  beforeEach(() => {
    fillText.mockClear();
    drawImage.mockClear();
    fillRect.mockClear();
    strokeRect.mockClear();
    toCanvas.mockReset();
    toCanvas.mockResolvedValue(undefined);

    const canvases = [
      {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 0,
          font: "",
          textAlign: "left" as const,
          textBaseline: "alphabetic" as const,
          fillRect,
          strokeRect,
          drawImage,
          fillText,
        }),
        toDataURL: () => "data:image/png;base64,rendered-label",
      },
      {
        width: 0,
        height: 0,
        getContext: () => null,
        toDataURL: () => "data:image/png;base64,qr",
      },
    ];

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        const nextCanvas = canvases.shift();
        if (!nextCanvas) {
          throw new Error("Unexpected canvas creation");
        }
        return nextCanvas as unknown as HTMLElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the QR code with item name and SKU text", async () => {
    const pngDataUrl = await renderQrLabelPng(baseItem);

    expect(pngDataUrl).toBe("data:image/png;base64,rendered-label");
    expect(toCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ width: 420, height: 420 }),
      baseItem.qrCodeDataUrl,
      expect.objectContaining({ width: 420 }),
    );
    expect(drawImage).toHaveBeenCalledOnce();
    expect(fillText).toHaveBeenNthCalledWith(1, "Bolts M6", 600, 610);
    expect(fillText).toHaveBeenNthCalledWith(2, "SKU-BOLTS-M6", 600, 664);
  });

  it("builds an export payload with a filename containing SKU and item name", async () => {
    const payload = await buildQrLabelExportPayload(baseItem);

    expect(payload).toEqual({
      suggestedFileName: "SKU-BOLTS-M6 - Bolts M6.png",
      pngDataUrl: "data:image/png;base64,rendered-label",
    });
  });
});
