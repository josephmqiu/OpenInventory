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

const disabledLanAccess: LanAccessState = {
  ...lanAccess,
  enabled: false,
  status: "stopped",
  statusMessage: "",
  urls: [],
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
  it("keeps save disabled until the port changes to a valid value", () => {
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
    const portInput = screen.getByRole("spinbutton") as HTMLInputElement;

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

  // Toggle switch tests
  it("calls onSave with enabled:false when toggling OFF", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={onSave}
      />,
      "en",
    );

    const toggle = screen.getByRole("switch") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(onSave).toHaveBeenCalledWith({ enabled: false, port: 4123 });
  });

  it("calls onSave with enabled:true when toggling ON", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={disabledLanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={onSave}
      />,
      "en",
    );

    const toggle = screen.getByRole("switch") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(onSave).toHaveBeenCalledWith({ enabled: true, port: 4123 });
  });

  it("disables the toggle when busy", () => {
    renderWithI18n(
      <LanAccessPanel
        busy={true}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    const toggle = screen.getByRole("switch") as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
  });

  it("sends current form port with toggle (not server port)", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={onSave}
      />,
      "en",
    );

    const portInput = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(portInput, { target: { value: "5000" } });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(onSave).toHaveBeenCalledWith({ enabled: false, port: 5000 });
  });

  // Regen confirm dialog tests
  it("opens confirm dialog when clicking Regenerate Access Key", () => {
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    fireEvent.click(screen.getByTestId("lan-regen-key"));
    expect(screen.getByTestId("regen-key-dialog")).toBeTruthy();
    expect(screen.getByText(/invalidate all printed QR codes/)).toBeTruthy();
  });

  it("dismisses dialog on Cancel without calling onRegenerateKey", () => {
    const onRegen = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={onRegen}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    fireEvent.click(screen.getByTestId("lan-regen-key"));
    fireEvent.click(screen.getByTestId("regen-dialog-cancel"));
    expect(screen.queryByTestId("regen-key-dialog")).toBeNull();
    expect(onRegen).not.toHaveBeenCalled();
  });

  it("calls onRegenerateKey on Confirm and closes dialog", () => {
    const onRegen = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={onRegen}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    fireEvent.click(screen.getByTestId("lan-regen-key"));
    fireEvent.click(screen.getByTestId("regen-dialog-confirm"));
    expect(onRegen).toHaveBeenCalled();
    expect(screen.queryByTestId("regen-key-dialog")).toBeNull();
  });

  // Disabled overlay test
  it("dims config section when LAN is disabled", () => {
    const { container } = renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={disabledLanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    const overlay = container.querySelector(".lan-disabled-overlay");
    expect(overlay).toBeTruthy();
  });

  it("does not dim config section when LAN is enabled", () => {
    const { container } = renderWithI18n(
      <LanAccessPanel
        busy={false}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
      "en",
    );

    const overlay = container.querySelector(".lan-disabled-overlay");
    expect(overlay).toBeNull();
  });
});
