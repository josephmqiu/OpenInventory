import { describe, expect, it } from "vitest";
import {
  buildQrLabelFileName,
  buildUniqueQrLabelFileNames,
  makeUniqueQrLabelFileName,
  normalizeQrLabelFileName,
} from "../../src/shared/qrLabelExport";

describe("qr label export filenames", () => {
  it("includes SKU and item name in the default filename", () => {
    expect(buildQrLabelFileName({
      id: "item-1",
      sku: "SKU-BOLTS-M6",
      name: "Bolts M6",
    } as const)).toBe("SKU-BOLTS-M6 - Bolts M6.png");
  });

  it("sanitizes characters that are invalid on Windows and macOS", () => {
    expect(normalizeQrLabelFileName('SKU/01 : Bolts? "M6".png')).toBe("SKU 01 Bolts M6.png");
  });

  it("prefixes reserved Windows device names", () => {
    expect(normalizeQrLabelFileName("CON.png")).toBe("_CON.png");
    expect(normalizeQrLabelFileName("lpt1")).toBe("_lpt1.png");
  });

  it("adds numeric suffixes for duplicate filenames", () => {
    const usedNames = new Set<string>();

    expect(makeUniqueQrLabelFileName("SKU-BOLTS-M6 - Bolts M6.png", usedNames)).toBe("SKU-BOLTS-M6 - Bolts M6.png");
    expect(makeUniqueQrLabelFileName("SKU-BOLTS-M6 - Bolts M6.png", usedNames)).toBe("SKU-BOLTS-M6 - Bolts M6 (2).png");
  });

  it("builds unique names for batch exports", () => {
    expect(buildUniqueQrLabelFileNames([
      { id: "item-1", sku: "SKU-BOLTS-M6", name: "Bolts M6" },
      { id: "item-2", sku: "SKU-BOLTS-M6", name: "Bolts M6" },
      { id: "item-3", sku: "", name: "Bolts M6" },
    ])).toEqual([
      "SKU-BOLTS-M6 - Bolts M6.png",
      "SKU-BOLTS-M6 - Bolts M6 (2).png",
      "NO-SKU - Bolts M6.png",
    ]);
  });
});
