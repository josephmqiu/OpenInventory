import { test, expect } from "./fixtures/electron-app";
import { navigateTo, expectSuccess, dismissBanner } from "./fixtures/helpers";

// inventory-basics seed: 3 items, 2 personnel (Alice, Bob)

test.describe.serial("settings", () => {
  test("backup panel shows status-first layout", async ({ page }) => {
    await navigateTo(page, "settings");
    const backupPanel = page.locator(".panel").filter({ has: page.locator("h2:has-text('Backup Plan')") });

    // Panel header with status pill
    await expect(backupPanel.locator(".status-pill")).toBeVisible({ timeout: 10_000 });

    // Backup Now and Restore buttons exist
    await expect(page.getByTestId("backup-now")).toBeVisible();
    await expect(page.getByTestId("backup-restore")).toBeVisible();

    // Schedule picker with number input and unit dropdown
    await expect(backupPanel.locator(".backup-schedule-number")).toBeVisible();
    await expect(backupPanel.locator(".backup-schedule-unit")).toBeVisible();

    // Startup checkbox
    await expect(backupPanel.locator(".backup-startup-check input[type='checkbox']")).toBeVisible();
  });

  test("remove a personnel member", async ({ page }) => {
    await dismissBanner(page);
    await navigateTo(page, "personnel");

    // Verify Alice is present
    await expect(page.locator(".personnel-card strong:has-text('Alice')")).toBeVisible({ timeout: 10_000 });

    // Click remove button for Alice
    await page.getByTestId("personnel-remove-Alice").click();

    await expectSuccess(page);

    // Verify Alice is gone
    await expect(page.locator(".personnel-card strong:has-text('Alice')")).toHaveCount(0);

    // Bob should still be there
    await expect(page.locator(".personnel-card strong:has-text('Bob')")).toBeVisible();
  });
});
