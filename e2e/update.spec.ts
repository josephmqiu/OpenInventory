import { test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

// Software Update tab (Settings → Update).
//
// E2E runs unpackaged Electron, so `is.dev` is true and the updater short-circuits
// to a deterministic "not-available" result (version "dev") — no real update server
// is contacted. That makes the up-to-date path testable; the downloaded/ready/chip
// states require a real release and are covered by unit tests instead.

test.describe.serial("software update", () => {
  test("Update tab shows the software update panel with version and check control", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Update" }).click();

    const panel = page.getByTestId("update-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator("h2")).toHaveText("Software Update");
    // First-run / up-to-date states both surface the version line.
    await expect(panel).toContainText("Version");
    await expect(page.getByRole("button", { name: "Check for updates" })).toBeVisible();
  });

  test("checking for updates reports up to date", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Update" }).click();

    await page.getByRole("button", { name: "Check for updates" }).click();

    await expect(page.getByTestId("update-panel")).toContainText("You're up to date");
    // No update is ready, so the ambient restart chip must not appear.
    await expect(page.getByTestId("update-chip")).toHaveCount(0);
  });

  // Kept last: stubs get-update-status for this worker without restoring, so it
  // must not run before the up-to-date assertions above.
  test("shows the restart chip when an update has finished downloading", async ({ page, app }) => {
    // useAutoUpdate fetches get-update-status on mount; force a "downloaded" status
    // and reload so the ambient chip renders (the dev updater otherwise reports
    // not-available, which is why this state can't be reached organically in E2E).
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("get-update-status");
      ipcMain.handle("get-update-status", () => ({ stage: "downloaded", version: "0.1.5" }));
    });

    await page.reload();
    await page.waitForSelector(".sidebar", { timeout: 30_000 });

    const chip = page.getByTestId("update-chip");
    await expect(chip).toBeVisible();
    await expect(chip.locator(".update-chip__action")).toBeVisible();
  });
});
