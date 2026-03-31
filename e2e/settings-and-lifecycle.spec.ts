import { test, expect } from "./fixtures/electron-app";
import fs from "fs";
import os from "os";
import path from "path";

const itemName = `Lifecycle Widget ${Date.now()}`;
const updatedItemName = `${itemName} Mk II`;
let backupDir = "";

async function dismissBanner(page: import("@playwright/test").Page) {
  const dismiss = page.locator(".feedback-banner__dismiss");
  if (await dismiss.isVisible()) {
    await dismiss.click();
  }
}

async function ensureEnglish(page: import("@playwright/test").Page) {
  const languageSelect = page.locator(".language-switch select");
  if (await languageSelect.count()) {
    await languageSelect.selectOption("en");
  }
}

test.describe.serial("settings and item lifecycle", () => {
  test.afterAll(() => {
    if (backupDir) {
      fs.rmSync(backupDir, { force: true, recursive: true });
    }
  });

  test("create, edit, and remove an inventory item", async ({ page }) => {
    await ensureEnglish(page);
    await page.click("button.nav-item:has-text('Item Management')");
    await page.click("button:has-text('Create Item')");

    const form = page.locator(".action-panel");
    await form.locator(`label:has-text('Item Name') input`).fill(itemName);
    await form.locator(`label:has-text('Category') select`).selectOption("Raw Material");
    await form.locator(`label:has-text('Location') input`).fill("Lifecycle Rack");
    await form.locator(`label:has-text('Unit') select`).selectOption("pcs");
    await form.locator(`label:has-text('Reorder Level') input`).fill("12");
    await form.locator(`label:has-text('Initial Quantity') input`).fill("30");
    await form.locator(`button:has-text('Save')`).click();

    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toContainText("Inventory item created.", {
      timeout: 10_000,
    });
    await expect(page.locator("tr", { has: page.locator(`td:has-text('${itemName}')`) })).toBeVisible();

    await dismissBanner(page);
    const itemRow = page.locator("tr", { has: page.locator(`td:has-text('${itemName}')`) });
    await itemRow.locator("button:has-text('Modify Item')").click();

    await expect(form.locator("h2")).toHaveText("Modify Inventory Item");
    await form.locator(`label:has-text('Item Name') input`).fill(updatedItemName);
    await form.locator(`label:has-text('Location') input`).fill("Lifecycle Rack B");
    await form.locator(`button:has-text('Modify Item')`).click();

    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toContainText("Inventory item updated.", {
      timeout: 10_000,
    });
    await expect(page.locator("tr", { has: page.locator(`td:has-text('${updatedItemName}')`) })).toBeVisible();
    await expect(page.locator("td:has-text('Lifecycle Rack B')")).toBeVisible();

    await dismissBanner(page);
    const updatedRow = page.locator("tr", { has: page.locator(`td:has-text('${updatedItemName}')`) });
    await updatedRow.locator("button:has-text('Remove Item')").click();
    await expect(form.locator("h2")).toHaveText("Remove Inventory Item");
    await form.locator("button:has-text('Remove Item')").click();

    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toContainText("Inventory item removed.", {
      timeout: 10_000,
    });
    await expect(page.locator(`td:has-text('${updatedItemName}')`)).toHaveCount(0);

    await page.click("button.nav-item:has-text('Inventory')");
    await expect(page.locator(`td:has-text('${updatedItemName}')`)).toHaveCount(0);
  });

  test("configures backup settings and writes a backup file", async ({ page }) => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-backup-"));

    await ensureEnglish(page);
    await dismissBanner(page);
    await page.click("button.nav-item:has-text('Settings')");

    const backupPanel = page.locator(".panel").filter({ has: page.locator("h2:has-text('Backup Plan')") });
    await backupPanel.locator("label:has-text('Target Path') input").fill(backupDir);
    await backupPanel.locator("label:has-text('Schedule') input").fill("daily");
    await backupPanel.locator("label:has-text('Retention') input").fill("7 days");
    await backupPanel.locator("button:has-text('Save')").click();

    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toContainText("Backup settings updated.", {
      timeout: 10_000,
    });

    await dismissBanner(page);
    await backupPanel.locator("button:has-text('Backup Now')").click();

    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toContainText("Backup completed.", {
      timeout: 15_000,
    });
    await expect.poll(() => fs.readdirSync(backupDir).filter((entry) => entry.endsWith(".db")).length).toBe(1);
  });
});
