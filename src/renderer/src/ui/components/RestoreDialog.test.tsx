import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../app/i18n";
import { RestoreDialog } from "./RestoreDialog";

afterEach(cleanup);

const comparison = {
  backup: {
    createdAt: "2026-04-01T16:00:00Z",
    items: 4,
    movements: 12,
    personnel: 2,
    schemaVersion: 7,
    appVersion: "0.0.4",
  },
  current: {
    lastActivity: "2026-04-02T12:00:00Z",
    items: 3,
    movements: 8,
    personnel: 2,
  },
  backupIsNewer: false,
} as const;

describe("RestoreDialog", () => {
  it("renders localized Chinese copy", () => {
    render(
      <RestoreDialog
        comparison={comparison}
        language="zh-CN"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("从备份恢复")).toBeTruthy();
    expect(screen.getByText("当前数据")).toBeTruthy();
    expect(screen.getByText("显示详情")).toBeTruthy();
    expect(screen.getByText("仍然恢复")).toBeTruthy();
  });

  it("focuses the cancel button on mount and confirms when asked", () => {
    const onConfirm = vi.fn();

    render(
      <RestoreDialog
        comparison={comparison}
        language="en"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const cancelButton = screen.getByTestId("restore-dialog-cancel");
    expect(document.activeElement).toBe(cancelButton);

    fireEvent.click(screen.getByTestId("restore-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels from the backdrop and Escape key but not from clicks inside the dialog", () => {
    const onCancel = vi.fn();

    render(
      <RestoreDialog
        comparison={comparison}
        language="en"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("restore-dialog"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("alertdialog"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("toggles restore details and shows the newer-backup warning branch", () => {
    render(
      <RestoreDialog
        comparison={{ ...comparison, backupIsNewer: true }}
        language="en"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("This backup is more recent than your current data.")).toBeTruthy();
    expect(screen.queryByText("0.0.4")).toBeNull();

    fireEvent.click(screen.getByText("Show details"));
    expect(screen.getByText("0.0.4")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();

    fireEvent.click(screen.getByText("Hide details"));
    expect(screen.queryByText("0.0.4")).toBeNull();
  });
});
