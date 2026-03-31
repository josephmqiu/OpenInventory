import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "../../app/i18n";
import type { BackupPlan } from "../../domain/models";
import { BackupPanel } from "./BackupPanel";

const dictionary = dictionaries.en;
const emptyPlan: BackupPlan = {
  targetPath: "",
  targetType: "local_folder",
  schedule: "",
  retention: "",
  lastSuccessfulBackup: "",
  nextScheduledBackup: "",
  status: "warning",
};

afterEach(() => {
  cleanup();
});

describe("BackupPanel", () => {
  it("disables backup-now when there is no configured target path", () => {
    render(
      <BackupPanel
        busy={false}
        backupPlan={emptyPlan}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect((screen.getByRole("button", { name: dictionary.backupNow }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: dictionary.save }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables save when the form changes and submits the updated backup plan", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <BackupPanel
        busy={false}
        backupPlan={emptyPlan}
        dictionary={dictionary}
        language="en"
        onBackupNow={vi.fn().mockResolvedValue(undefined)}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: dictionary.targetPath }), {
      target: { value: "/tmp/openinventory-backups" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: dictionary.schedule }), {
      target: { value: "daily" },
    });

    const saveButton = screen.getByRole("button", { name: dictionary.save }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        targetPath: "/tmp/openinventory-backups",
        targetType: "local_folder",
        schedule: "daily",
        retention: "",
      });
    });
  });
});
