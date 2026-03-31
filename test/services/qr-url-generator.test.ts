/**
 * QR URL generator tests.
 *
 * Verifies the qrCodeGenerator closure used in index.ts produces correct URLs
 * based on the mutable LAN state.
 */
import { describe, it, expect } from "vitest";

interface LanState {
  primaryUrl: string;
}

/** Mirrors the closure from src/main/index.ts */
function makeQrCodeGenerator(lanState: LanState): (itemId: string, sku: string) => string {
  return (itemId: string, _sku: string): string =>
    lanState.primaryUrl
      ? `${lanState.primaryUrl}/issue/${itemId}`
      : "";
}

describe("QR URL generator", () => {
  it("returns empty string when LAN server is not running", () => {
    const lanState: LanState = { primaryUrl: "" };
    const generate = makeQrCodeGenerator(lanState);
    expect(generate("item-123", "SKU-001")).toBe("");
  });

  it("returns correct public URL when LAN server is running", () => {
    const lanState: LanState = { primaryUrl: "http://192.168.1.5:4123" };
    const generate = makeQrCodeGenerator(lanState);
    expect(generate("item-123", "SKU-001")).toBe(
      "http://192.168.1.5:4123/issue/item-123",
    );
  });

  it("uses the current primaryUrl on each call (mutable ref)", () => {
    const lanState: LanState = { primaryUrl: "" };
    const generate = makeQrCodeGenerator(lanState);

    expect(generate("item-1", "SKU")).toBe("");

    // Simulate LAN server starting
    lanState.primaryUrl = "http://10.0.0.2:8080";
    expect(generate("item-1", "SKU")).toBe(
      "http://10.0.0.2:8080/issue/item-1",
    );

    // Simulate LAN server stopping
    lanState.primaryUrl = "";
    expect(generate("item-1", "SKU")).toBe("");
  });

  it("ignores the sku parameter (only itemId used in URL)", () => {
    const lanState: LanState = { primaryUrl: "http://192.168.1.1:4123" };
    const generate = makeQrCodeGenerator(lanState);
    const url1 = generate("abc", "SKU-A");
    const url2 = generate("abc", "SKU-B");
    expect(url1).toBe(url2);
  });

  it("handles different port numbers", () => {
    const lanState: LanState = { primaryUrl: "http://172.16.0.1:9999" };
    const generate = makeQrCodeGenerator(lanState);
    expect(generate("x", "y")).toBe(
      "http://172.16.0.1:9999/issue/x",
    );
  });
});
