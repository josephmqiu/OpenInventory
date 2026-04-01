import { test, expect } from "./fixtures/electron-app";
import { navigateTo, expectSuccess, dismissBanner } from "./fixtures/helpers";
import fs from "fs";
import os from "os";
import path from "path";

let backupDir = "";

// inventory-basics seed: 3 items, 2 personnel (Alice, Bob)

test.describe.serial("settings and backup", () => {
  test.afterAll(() => {
    if (backupDir) {
      fs.rmSync(backupDir, { force: true, recursive: true });
    }
  });

  test("configures backup settings and saves", async ({ page }) => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-backup-"));

    await navigateTo(page, "settings");
    const backupPanel = page.locator(".panel").filter({ has: page.locator("h2:has-text('Backup Plan')") });

    await backupPanel.locator("label:has-text('Target Path') input").fill(backupDir);
    await backupPanel.locator("label:has-text('Schedule') input").fill("daily");
    await backupPanel.locator("label:has-text('Retention') input").fill("7 days");
    await page.getByTestId("backup-save").click();

    await expect(page.getByTestId("feedback-banner")).toContainText("Backup settings updated.", {
      timeout: 10_000,
    });
  });

  test("backup now writes a database file", async ({ page }) => {
    await dismissBanner(page);
    await page.getByTestId("backup-now").click();

    await expect(page.getByTestId("feedback-banner")).toContainText("Backup completed.", {
      timeout: 15_000,
    });

    await expect.poll(
      () => fs.readdirSync(backupDir).filter((entry) => entry.endsWith(".db")).length,
    ).toBe(1);
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
