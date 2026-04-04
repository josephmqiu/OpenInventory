import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { dismissBanner, navigateTo } from "./fixtures/helpers";
import { readSaveDialogDefaultPath, stubOpenDialog, stubSaveDialog } from "./fixtures/dialogs";
import fs from "fs";
import os from "os";
import path from "path";

async function closeDetailsPanelIfOpen(page: import("@playwright/test").Page): Promise<void> {
  const detailsPanel = page.getByTestId("item-details-panel");
  if (await detailsPanel.count()) {
    await page.getByRole("button", { name: /back to list/i }).click();
  }
}

test.describe.serial("QR label export", () => {
  test("exports a single QR label from item details", async ({ app, page }) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-export-single-"));
    const exportPath = path.join(tempDir, "exported-label.png");

    await stubSaveDialog(app, exportPath);
    await navigateTo(page, "inventory");

    const boltsRow = page.locator("tr", {
      has: page.locator("td:has-text('Bolts M6')"),
    });

    await expect(page.getByText("Print QR Label")).toHaveCount(0);
    await boltsRow.click();
    await expect(page.getByTestId("item-export-qr-label")).toBeEnabled();
    await page.getByTestId("item-export-qr-label").click();

    await expect.poll(() => fs.existsSync(exportPath)).toBe(true);
    expect(fs.statSync(exportPath).size).toBeGreaterThan(0);

    const defaultPath = await readSaveDialogDefaultPath(app);
    expect(defaultPath).toContain("SKU-BOLTS-M6");
    expect(defaultPath).toContain("Bolts M6");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("exports selected QR labels into a folder", async ({ app, page }) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-export-batch-"));

    await dismissBanner(page);
    await stubOpenDialog(app, tempDir);
    await navigateTo(page, "inventory");
    await closeDetailsPanelIfOpen(page);

    const boltsRow = page.locator("tr", {
      has: page.locator("td:has-text('Bolts M6')"),
    });
    const washersRow = page.locator("tr", {
      has: page.locator("td:has-text('Washers M6')"),
    });

    await expect(page.getByText("Print Selected QR Codes")).toHaveCount(0);
    await boltsRow.locator("input[type='checkbox']").check();
    await washersRow.locator("input[type='checkbox']").check();
    await expect(page.getByTestId("item-export-selected-qrs")).toBeEnabled();
    await page.getByTestId("item-export-selected-qrs").click();

    await expect.poll(
      () => fs.readdirSync(tempDir).filter((entry) => entry.endsWith(".png")).sort(),
      { timeout: 20_000 },
    ).toEqual([
      "SKU-BOLTS-M6 - Bolts M6.png",
      "SKU-WASHERS-M6 - Washers M6.png",
    ]);

    for (const entry of fs.readdirSync(tempDir)) {
      expect(fs.statSync(path.join(tempDir, entry)).size).toBeGreaterThan(0);
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
