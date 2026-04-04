import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

test.describe.serial("backup error status", () => {
  test("shows backup error status and banner from persisted state", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Backup" }).click();

    const backupPanel = page.locator(".panel").filter({
      has: page.locator("h2:has-text('Backup Plan')"),
    });

    await expect(backupPanel.locator(".status-pill")).toContainText(/needs attention/i);
    await expect(backupPanel.locator(".panel-banner--error")).toContainText("Backup operation failed.");
  });
});
