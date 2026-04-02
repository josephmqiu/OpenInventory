import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "../../app/i18n";
import type { BackupPlan } from "../../domain/models";
import { BackupPanel } from "./BackupPanel";

const dictionary = dictionaries.en;

function makePlan(overrides: Partial<BackupPlan> = {}): BackupPlan {
  return {
    targetPath: "",
    schedule: { intervalValue: 0, intervalUnit: "hours", onStartup: false },
    lastSuccessfulBackup: "",
    lastFileSize: 0,
    lastVerified: false,
    lastError: "",
    status: "warning",
    cloudProvider: "",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("BackupPanel", () => {
  it("disables backup-now when there is no configured target path", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan()}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect((screen.getByTestId("backup-now") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables backup-now when target path is configured", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan({ targetPath: "/tmp/backups", status: "healthy" })}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect((screen.getByTestId("backup-now") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows warning banner when not configured", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan()}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(dictionary.backupNotConfigured)).toBeTruthy();
  });

  it("shows status strip when configured with last backup", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan({
          targetPath: "/tmp/backups",
          status: "healthy",
          lastSuccessfulBackup: "2026-04-01T16:00:00Z",
          lastFileSize: 13000000,
          lastVerified: true,
        })}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(/12\.4 MB|MB/)).toBeTruthy();
    expect(screen.getByText(/verified/)).toBeTruthy();
  });

  it("shows error banner when lastError is set", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan({
          targetPath: "/tmp/backups",
          status: "error",
          lastError: "Disk full",
        })}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("Disk full")).toBeTruthy();
  });

  it("shows cloud provider info when detected", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan({
          targetPath: "/Users/joe/Dropbox/backups",
          status: "healthy",
          cloudProvider: "Dropbox",
        })}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(/synced by Dropbox/)).toBeTruthy();
  });

  it("shows restore button when onRestore is provided", () => {
    const onRestore = vi.fn();
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan()}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onRestore={onRestore}
      />,
    );

    const restoreBtn = screen.getByTestId("backup-restore");
    expect(restoreBtn).toBeTruthy();
    fireEvent.click(restoreBtn);
    expect(onRestore).toHaveBeenCalled();
  });

  it("disables all controls when backing up", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={makePlan({ targetPath: "/tmp/backups", status: "backing_up" })}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onRestore={vi.fn()}
      />,
    );

    expect((screen.getByTestId("backup-now") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("backup-restore") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(dictionary.backupNowInProgress)).toBeTruthy();
  });
});
