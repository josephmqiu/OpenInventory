import { test, expect } from "./fixtures/electron-app";

let primaryUrl = "";
let accessKey = "";
let itemId = "";
const itemName = `QR Mobile Test ${Date.now()}`;
const operatorName = "QR Test Operator";

async function dismissBanner(page: import("@playwright/test").Page) {
  const dismiss = page.locator(".feedback-banner__dismiss");
  if (await dismiss.isVisible()) await dismiss.click();
}

test.describe.serial("QR code mobile issue flow", () => {
  test("setup: enable LAN, create item and personnel", async ({ page }) => {
    // Enable LAN
    await page.click("button.nav-item:has-text('Settings')");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    const statusPill = lanPanel.locator(".status-pill");
    const statusText = await statusPill.textContent();

    if (!statusText?.includes("Running")) {
      await lanPanel.locator("input[type='number']").fill("19878");
      await lanPanel.locator("select").first().selectOption("enabled");
      await lanPanel.locator("button:has-text('Save LAN Settings')").click();
      await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    }

    await expect(statusPill).toContainText("Running", { timeout: 10_000 });
    const link = lanPanel.locator("a[href^='http']").first();
    primaryUrl = await link.getAttribute("href") ?? "";
    accessKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();

    // Create personnel
    await dismissBanner(page);
    await page.click("button.nav-item:has-text('Personnel')");
    await page.locator(".personnel-toolbar input").fill(operatorName);
    await page.click("button:has-text('Add Personnel')");
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });

    // Create item
    await dismissBanner(page);
    await page.click("button.nav-item:has-text('Item Management')");
    await page.click("button:has-text('Create Item')");
    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill(itemName);
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("QR Test Loc");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("100");
    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });

    // Get item ID
    const res = await fetch(`${primaryUrl}/api/snapshot`, {
      headers: { "x-inventory-key": accessKey },
    });
    const snapshot = (await res.json()) as { items: Array<{ id: string; name: string }> };
    itemId = snapshot.items.find((i) => i.name === itemName)?.id ?? "";
    expect(itemId).toBeTruthy();
  });

  test("mobile issue page loads with correct item details", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${primaryUrl}/issue/${itemId}`);
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-header__name")).toHaveText(itemName);
      await expect(page.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("100");
    } finally {
      await ctx.close();
    }
  });

  test("preset buttons increment quantity cumulatively", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${primaryUrl}/issue/${itemId}`);
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await page.click(".qi-preset-btn:has-text('+5')");
      await page.click(".qi-preset-btn:has-text('+10')");

      const input = page.locator(".qi-input-row input");
      await expect(input).toHaveValue("15");

      // Clear resets
      await page.click(".qi-preset-btn--clear");
      await expect(input).toHaveValue("");
    } finally {
      await ctx.close();
    }
  });

  test("submit issue updates stock and shows success", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${primaryUrl}/issue/${itemId}`);
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await page.click(".qi-preset-btn:has-text('+5')");
      await page.locator(".qi-form select").selectOption(operatorName);
      await page.click(".qi-submit-btn");

      await expect(page.locator(".qi-feedback--success")).toBeVisible({ timeout: 10_000 });
      // Stock should update from 100 to 95
      await expect(page.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("95");
    } finally {
      await ctx.close();
    }
  });

  test("cleanup: disable LAN access", async ({ page }) => {
    await page.click("button.nav-item:has-text('Settings')");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });
    await lanPanel.locator("select").first().selectOption("disabled");
    await lanPanel.locator("button:has-text('Save LAN Settings')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
  });
});
