import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "../../domain/models";
import { renderWithI18n } from "../../test/renderWithI18n";
import { UpdateSettingsPanel } from "./UpdateSettingsPanel";

afterEach(cleanup);

function render(status: UpdateStatus, overrides: Partial<{ appVersion: string | null; onCheck: () => void; onRestart: () => void }> = {}) {
  const onCheck = overrides.onCheck ?? vi.fn();
  const onRestart = overrides.onRestart ?? vi.fn();
  renderWithI18n(
    <UpdateSettingsPanel
      status={status}
      appVersion={overrides.appVersion ?? "0.1.4"}
      onCheck={onCheck}
      onRestart={onRestart}
    />,
  );
  return { onCheck, onRestart };
}

describe("UpdateSettingsPanel", () => {
  it("idle (first run) shows the current version and a Check button", () => {
    const { onCheck } = render({ stage: "idle" });
    expect(screen.getByText("Version 0.1.4")).toBeTruthy();
    expect(screen.getByText("Updates install automatically. Check anytime.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("checking disables the Check button", () => {
    render({ stage: "checking" });
    expect(screen.getByText("Checking for updates…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check for updates" }).hasAttribute("disabled")).toBe(true);
  });

  it("downloading shows the new version and a progress bar", () => {
    render({ stage: "downloading", percent: 45, transferred: 45, total: 100 });
    expect(screen.getByText("Downloading update…")).toBeTruthy();
    expect(document.querySelector(".mini-progress__bar")).toBeTruthy();
  });

  it("downloaded shows ready state and Restart triggers onRestart", () => {
    const { onRestart } = render({ stage: "downloaded", version: "0.1.5" });
    expect(screen.getByText("Version 0.1.5 is ready to install")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restart to update" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("not-available shows up to date with the current version", () => {
    render({ stage: "not-available", version: "0.1.4" });
    expect(screen.getByText("You're up to date")).toBeTruthy();
    expect(screen.getByText("Version 0.1.4")).toBeTruthy();
  });

  it("error shows the backend message and Try again triggers onCheck", () => {
    const { onCheck } = render({ stage: "error", message: "Cannot connect to update server." });
    expect(screen.getByText("Couldn't check for updates")).toBeTruthy();
    expect(screen.getByText("Cannot connect to update server.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});
