import { test, expect } from "./fixtures/electron-app";

test.describe.serial("LAN access and QR codes", () => {
  test("LAN access panel shows stopped by default", async ({ page }) => {
    await page.click("button.nav-item:has-text('Settings')");

    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });
    await expect(lanPanel.locator(".status-pill")).toContainText("Stopped");
  });

  test("enable LAN access and verify running status", async ({ page }) => {
    const lanPanel = page.locator(".panel:has-text('LAN Access')");

    // Use a non-standard port to avoid conflicts
    await lanPanel.locator("input[type='number']").fill("19877");

    // Enable LAN
    await lanPanel.locator("select").first().selectOption("enabled");

    // Save
    const saveBtn = lanPanel.locator("button:has-text('Save LAN Settings')");
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Wait for success feedback
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });

    // Status should show "Running"
    await expect(lanPanel.locator(".status-pill")).toContainText("Running", { timeout: 10_000 });

    // At least one URL should appear
    await expect(lanPanel.locator("a[href^='http']").first()).toBeVisible({ timeout: 5_000 });
  });

  test("create an item for QR code testing", async ({ page }) => {
    // Dismiss any stale banner
    const dismiss = page.locator(".feedback-banner__dismiss");
    if (await dismiss.isVisible()) await dismiss.click();

    // Navigate to Item Management and create an item (matching inventory-workflow pattern)
    await page.click("button.nav-item:has-text('Item Management')");
    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item", { timeout: 10_000 });

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("LAN QR Test Widget");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Warehouse QR");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("50");

    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("td:has-text('LAN QR Test Widget')")).toBeVisible();
  });

  test("item detail shows QR code when LAN is enabled", async ({ page }) => {
    // Click "View Details" button in the item's row
    const row = page.locator("tr:has-text('LAN QR Test Widget')");
    await row.locator("button:has-text('View Details'), button:has-text('Details')").first().click();

    // QR code section should have a rendered image
    const qrSection = page.locator(".item-details-qr");
    await expect(qrSection).toBeVisible({ timeout: 10_000 });
    await expect(qrSection.locator("img")).toBeVisible({ timeout: 10_000 });

    // Go back
    await page.locator("button:has-text('Back')").click();
  });

  test("disable LAN access and verify stopped status", async ({ page }) => {
    await page.click("button.nav-item:has-text('Settings')");

    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    await lanPanel.locator("select").first().selectOption("disabled");

    const saveBtn = lanPanel.locator("button:has-text('Save LAN Settings')");
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(lanPanel.locator(".status-pill")).toContainText("Stopped", { timeout: 10_000 });
  });
});
