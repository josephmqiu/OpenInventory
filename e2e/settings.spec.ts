import { test, expect } from "./fixtures/electron-app";
import { navigateTo, expectSuccess, dismissBanner } from "./fixtures/helpers";

// inventory-basics seed: 3 items, 2 personnel (Alice, Bob)

test.describe.serial("settings", () => {
  test("backup panel shows status-first layout", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Backup" }).click();
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

  test("add a personnel member", async ({ page }) => {
    await dismissBanner(page);
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Personnel" }).click();

    await page.locator("#personnel-name-input").fill("Charlie");
    await page.getByRole("button", { name: "Add Personnel" }).click();
    await expectSuccess(page);
    await expect(page.locator(".cell-title:has-text('Charlie')")).toBeVisible();
  });

  test("removing all personnel blocks stock actions until settings are revisited", async ({ page }) => {
    await dismissBanner(page);
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Personnel" }).click();

    for (const name of ["Alice", "Bob", "Charlie"]) {
      const removeButton = page.getByTestId(`personnel-remove-${name}`);
      await expect(removeButton).toBeVisible();
      await removeButton.click();
      await page.getByTestId(`personnel-confirm-${name}`).click();
      await expectSuccess(page);
    }

    await expect(page.locator(".empty-state")).toContainText("No personnel records yet.");

    await navigateTo(page, "inventory");
    await page.locator(".panel__actions").getByRole("button", { name: "Receive Stock" }).click();
    await expect(page.locator(".action-panel")).toContainText(
      "Add at least one personnel record before receiving or issuing stock.",
    );
    await expect(page.getByTestId("action-submit")).toBeDisabled();

    await page.getByRole("button", { name: /Go to Settings/i }).click();
    await expect(page.locator(".topbar h2")).toHaveText("Settings");
    await expect(page.getByRole("tab", { name: "Personnel" })).toHaveClass(/filter-tab--active/);
  });
});
