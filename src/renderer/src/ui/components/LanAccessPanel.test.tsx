import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "../../app/i18n";
import type { LanAccessState } from "../../domain/models";
import { LanAccessPanel } from "./LanAccessPanel";

const dictionary = dictionaries.en;
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
    render(
      <LanAccessPanel
        busy={false}
        dictionary={dictionary}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const saveButton = screen.getByRole("button", { name: dictionary.lanSaveSettings }) as HTMLButtonElement;
    const portInput = screen.getByRole("spinbutton", { name: dictionary.lanPort }) as HTMLInputElement;

    expect(saveButton.disabled).toBe(true);

    fireEvent.change(portInput, { target: { value: "70000" } });
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(portInput, { target: { value: "4124" } });
    expect(saveButton.disabled).toBe(false);
  });

  it("shows success feedback after copying the LAN access key", async () => {
    render(
      <LanAccessPanel
        busy={false}
        dictionary={dictionary}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: dictionary.lanCopy }));

    await waitFor(() => {
      expect(screen.getByText(dictionary.lanCopySuccess)).toBeTruthy();
    });
  });

  it("shows an error banner when copying the access key fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard unavailable")),
      },
    });

    render(
      <LanAccessPanel
        busy={false}
        dictionary={dictionary}
        lanAccess={lanAccess}
        onRegenerateKey={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: dictionary.lanCopy }));

    await waitFor(() => {
      expect(screen.getByText(dictionary.lanCopyError)).toBeTruthy();
    });
  });
});
