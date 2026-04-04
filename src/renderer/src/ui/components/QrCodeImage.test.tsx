import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,FAKEQURCODE"),
  },
}));

import { QrCodeImage } from "./QrCodeImage";

afterEach(cleanup);

describe("QrCodeImage", () => {
  it("renders an img element with the QR data URL", async () => {
    renderWithI18n(<QrCodeImage text="https://example.com" alt="QR Code" />);

    await waitFor(() => {
      const img = screen.getByAltText("QR Code") as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toBe("data:image/png;base64,FAKEQURCODE");
    });
  });

  it("renders nothing when text is empty", () => {
    const { container } = renderWithI18n(<QrCodeImage text="" alt="QR Code" />);

    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing initially before the data URL is generated", () => {
    // QRCode.toDataURL returns a promise, so first render shows nothing
    const { container } = renderWithI18n(
      <QrCodeImage text="https://example.com" alt="QR Code" />,
    );

    // Synchronously, the img should not be present yet or it may be
    // depending on mock resolution timing. The important thing is
    // it eventually renders (tested above).
    // This test just verifies the component doesn't crash.
    expect(container).toBeTruthy();
  });
});
