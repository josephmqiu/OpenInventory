import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";
import {
  readRestoreRelaunchCalls,
  stubRestoreRelaunchCapture,
  stubRestoreSelection,
} from "./fixtures/dialogs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("real restore writes pending state and requests an app relaunch", async ({ page, app, userDataDir }) => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-restore-handoff-"));

  try {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Backup" }).click();

    const backupPanel = page.locator(".panel").filter({ has: page.locator("h2:has-text('Backup Plan')") });
    await backupPanel.locator(".backup-path-input").fill(backupDir);
    await page.getByTestId("backup-save").click();
    await expect(page.getByTestId("feedback-banner")).toContainText("Backup settings updated.", {
      timeout: 10_000,
    });

    await page.getByTestId("backup-now").click();
    await expect(page.getByTestId("feedback-banner")).toContainText("Backup completed.", {
      timeout: 15_000,
    });

    const restoreSource = path.join(backupDir, "OpenInventory-Backup");
    await stubRestoreSelection(app, restoreSource);
    await stubRestoreRelaunchCapture(app);

    await page.getByTestId("backup-restore").click();
    await expect(page.getByTestId("restore-dialog")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("restore-dialog-confirm").click();

    const pendingPath = path.join(userDataDir, "data", ".restore-pending.json");
    await expect.poll(() => fs.existsSync(pendingPath)).toBe(true);

    const pending = JSON.parse(fs.readFileSync(pendingPath, "utf-8")) as {
      backupDir: string;
      preserveSettings: Record<string, string>;
    };

    expect(pending.backupDir).toBe(restoreSource);
    expect(pending.preserveSettings["backup.target_path"]).toBe(backupDir);

    await expect.poll(() => readRestoreRelaunchCalls(app)).toEqual([
      { type: "relaunch" },
      { type: "exit", code: 0 },
    ]);
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
});
