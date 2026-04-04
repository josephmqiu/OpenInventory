import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/renderWithI18n";
import type { UpdateStatus } from "../../domain/models";
import { UpdateBanner } from "./UpdateBanner";

afterEach(cleanup);

function renderBanner(status: UpdateStatus) {
  const onDownload = vi.fn();
  const onInstall = vi.fn();
  const onDismiss = vi.fn();
  const result = renderWithI18n(
    <UpdateBanner
      status={status}
      onDownload={onDownload}
      onInstall={onInstall}
      onDismiss={onDismiss}
    />,
    "en",
  );
  return { ...result, onDownload, onInstall, onDismiss };
}

describe("UpdateBanner", () => {
  it("renders nothing when status is idle", () => {
    const { container } = renderBanner({ stage: "idle" });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when status is checking", () => {
    const { container } = renderBanner({ stage: "checking" });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when status is not-available", () => {
    const { container } = renderBanner({ stage: "not-available", version: "1.0.0" });
    expect(container.innerHTML).toBe("");
  });

  it("shows download button when update is available", () => {
    const { onDownload } = renderBanner({
      stage: "available",
      version: "2.0.0",
      releaseNotes: "New features",
    });

    expect(screen.getByText(/2\.0\.0/)).toBeTruthy();

    const downloadBtn = screen.getByText("Download");
    expect(downloadBtn).toBeTruthy();
    fireEvent.click(downloadBtn);
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it("shows progress bar when downloading", () => {
    const { container } = renderBanner({
      stage: "downloading",
      percent: 42.7,
      transferred: 4270000,
      total: 10000000,
    });

    expect(screen.getByText(/43%/)).toBeTruthy();

    const progressBar = container.querySelector(".update-banner__progress-bar") as HTMLElement;
    expect(progressBar).toBeTruthy();
    expect(progressBar.style.width).toBe("43%");
  });

  it("shows restart button when update is downloaded", () => {
    const { onInstall } = renderBanner({ stage: "downloaded", version: "2.0.0" });

    expect(screen.getByText(/restart to apply/i)).toBeTruthy();

    const restartBtn = screen.getByText("Restart Now");
    expect(restartBtn).toBeTruthy();
    fireEvent.click(restartBtn);
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("shows error message when update check fails", () => {
    renderBanner({ stage: "error", message: "Network error" });

    expect(screen.getByText(/update check failed/i)).toBeTruthy();
  });

  it("calls onDismiss when dismiss button is clicked on available state", () => {
    const { onDismiss } = renderBanner({
      stage: "available",
      version: "2.0.0",
      releaseNotes: "",
    });

    const dismissBtn = screen.getByLabelText("Dismiss");
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
