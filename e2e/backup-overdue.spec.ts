import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

test.describe.serial("backup overdue status", () => {
  test("shows the overdue badge when the last successful backup is stale", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Backup" }).click();

    const statusStrip = page.locator(".backup-status-strip");
    await expect(statusStrip).toBeVisible({ timeout: 10_000 });
    await expect(statusStrip).toContainText("verified");
    await expect(page.locator(".backup-status-strip__badge--warning")).toContainText(/overdue/i);
  });
});
