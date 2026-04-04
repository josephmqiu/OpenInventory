import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanAccessState } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { LanAccessPanel } from "./LanAccessPanel";

const lanAccess: LanAccessState = {
  enabled: true,
  port: 4123,
  accessKey: "lan-key-123",
  urls: ["http://127.0.0.1:4123"],
  status: "running",
  statusMessage: "LAN server is running.",
};

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("LanAccessPanel", () => {
  it("keeps save disabled until the form changes to a valid port", () => {
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    const saveButton = screen.getByRole("button", { name: "Save LAN Settings" }) as HTMLButtonElement;
    const portInput = screen.getByRole("spinbutton", { name: "Port" }) as HTMLInputElement;

    expect(saveButton.disabled).toBe(true);

    fireEvent.change(portInput, { target: { value: "70000" } });
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(portInput, { target: { value: "4124" } });
    expect(saveButton.disabled).toBe(false);
  });

  it("shows success feedback after copying the LAN access key", async () => {
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(screen.getByText("Access key copied to clipboard.")).toBeTruthy();
    });
  });

  it("shows an error banner when copying the access key fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard unavailable")),
      },
    });

    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to copy the access key on this device.")).toBeTruthy();
    });
  });

  it("shows the IP-changed warning when LAN URLs may be stale", () => {
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={{ ...lanAccess, ipChanged: true }}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    expect(
      screen.getByText("Your network address has changed. Printed QR codes may point to the old address."),
    ).toBeTruthy();
  });
});
