import { test, expect } from "./fixtures/electron-app";

let primaryUrl = "";
let accessKey = "";
let publicItemId = "";
const publicItemName = `LAN QR Test Widget ${Date.now()}`;
const publicOperatorName = "LAN Browser Operator";

async function dismissBanner(page: import("@playwright/test").Page) {
  const dismiss = page.locator(".feedback-banner__dismiss");
  if (await dismiss.isVisible()) {
    await dismiss.click();
  }
}

async function fetchSnapshot() {
  const response = await fetch(`${primaryUrl}/api/snapshot`, {
    headers: {
      "x-inventory-key": accessKey,
    },
  });
  expect(response.ok).toBe(true);
  return response.json() as Promise<{
    items: Array<{ id: string; name: string; currentQuantity: number }>;
  }>;
}

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
    const primaryLink = lanPanel.locator("a[href^='http']").first();
    await expect(primaryLink).toBeVisible({ timeout: 5_000 });
    primaryUrl = await primaryLink.getAttribute("href") ?? "";
    accessKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();
    expect(primaryUrl).toMatch(/^http:\/\//);
    expect(accessKey.length).toBeGreaterThan(0);
  });

  test("create an item for QR code testing", async ({ page }) => {
    await dismissBanner(page);

    // Navigate to Item Management and create an item (matching inventory-workflow pattern)
    await page.click("button.nav-item:has-text('Item Management')");
    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item", { timeout: 10_000 });

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill(publicItemName);
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Warehouse QR");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("50");

    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`td:has-text('${publicItemName}')`)).toBeVisible();

    const snapshot = await fetchSnapshot();
    publicItemId = snapshot.items.find((entry) => entry.name === publicItemName)?.id ?? "";
    expect(publicItemId).toBeTruthy();
  });

  test("item detail shows QR code when LAN is enabled", async ({ page }) => {
    // Click "View Details" button in the item's row
    const row = page.locator(`tr:has-text('${publicItemName}')`);
    await row.locator("button:has-text('View Details'), button:has-text('Details')").first().click();

    // QR code section should have a rendered image
    const qrSection = page.locator(".item-details-qr");
    await expect(qrSection).toBeVisible({ timeout: 10_000 });
    await expect(qrSection.locator("img")).toBeVisible({ timeout: 10_000 });

    // Go back
    await page.locator("button:has-text('Back')").click();
  });

  test("workspace browser access requires the LAN access key", async ({ browserPage, page }) => {
    await dismissBanner(page);
    await page.click("button.nav-item:has-text('Personnel')");
    await page.locator(".personnel-toolbar input").fill(publicOperatorName);
    await page.click("button:has-text('Add Personnel')");
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });

    await browserPage.goto(primaryUrl);
    await expect(browserPage.locator(".auth-card")).toBeVisible({ timeout: 10_000 });
    await expect(browserPage.locator(".sidebar")).toHaveCount(0);

    await browserPage.locator(".auth-card__field input").fill(accessKey);
    await browserPage.locator("button:has-text('Connect')").click();

    await expect(browserPage.locator(".sidebar")).toBeVisible({ timeout: 10_000 });
    await expect(browserPage.locator(".topbar h2")).toHaveText("Dashboard");
  });

  test("public issue page works end to end without workspace auth", async ({ browser }) => {
    const context = await browser.newContext();
    const publicPage = await context.newPage();
    const issueUrl = `${primaryUrl}/issue/${publicItemId}`;

    try {
      await publicPage.goto(issueUrl);
      // The QR view now uses the mobile-specific QuickIssueMobile component
      await expect(publicPage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await publicPage.locator(".qi-input-row input").fill("7");
      await publicPage.locator(".qi-form select").selectOption(publicOperatorName);
      await publicPage.locator(".qi-submit-btn").click();

      await expect(publicPage.locator(".qi-feedback--success")).toBeVisible({ timeout: 10_000 });

      await expect.poll(async () => {
        const snapshot = await fetchSnapshot();
        return snapshot.items.find((entry) => entry.id === publicItemId)?.currentQuantity;
      }).toBe(43);
    } finally {
      await context.close();
    }
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
