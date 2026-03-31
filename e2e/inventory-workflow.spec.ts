import { test, expect } from "./fixtures/electron-app";

// Use the topbar h2 for section verification (unique, unlike panel h2s)
const topbarTitle = (page: import("@playwright/test").Page) =>
  page.locator(".topbar h2");

test.describe.serial("inventory workflow", () => {
  // ── Step 1: Create items in different stock states ──────────────────

  test("create item with healthy stock (Bolts M6, qty=100, reorder=20)", async ({ page }) => {
    await page.click("button.nav-item:has-text('Item Management')");
    await expect(topbarTitle(page)).toHaveText("Item Management");

    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("Bolts M6");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Warehouse A");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("20");
    await form.locator("label:has-text('Initial Quantity') input").fill("100");

    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("td:has-text('Bolts M6')")).toBeVisible();
  });

  test("create item with low stock (Washers M6, qty=8, reorder=10)", async ({ page }) => {
    // Dismiss any stale banner from prior test
    const dismiss = page.locator(".feedback-banner__dismiss");
    if (await dismiss.isVisible()) await dismiss.click();

    await page.click("button.nav-item:has-text('Item Management')");
    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("Washers M6");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Warehouse B");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("10");
    await form.locator("label:has-text('Initial Quantity') input").fill("8");

    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("td:has-text('Washers M6')")).toBeVisible();
  });

  test("create item with zero stock (Nuts M6, qty=0, reorder=5)", async ({ page }) => {
    const dismiss = page.locator(".feedback-banner__dismiss");
    if (await dismiss.isVisible()) await dismiss.click();

    await page.click("button.nav-item:has-text('Item Management')");
    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("Nuts M6");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Warehouse A");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("0");

    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("td:has-text('Nuts M6')")).toBeVisible();
  });

  // ── Step 2: Add personnel ──────────────────────────────────────────

  test("add personnel members Alice and Bob", async ({ page }) => {
    await page.click("button.nav-item:has-text('Personnel')");
    await expect(topbarTitle(page)).toHaveText("Personnel");

    // Add Alice
    await page.locator(".personnel-toolbar input").fill("Alice");
    await page.click("button:has-text('Add Personnel')");
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".personnel-card strong:has-text('Alice')")).toBeVisible();

    // Dismiss notice before next action
    const dismiss = page.locator(".feedback-banner__dismiss");
    if (await dismiss.isVisible()) await dismiss.click();

    // Add Bob
    await page.locator(".personnel-toolbar input").fill("Bob");
    await page.click("button:has-text('Add Personnel')");
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".personnel-card strong:has-text('Bob')")).toBeVisible();

    await expect(page.locator(".personnel-card")).toHaveCount(2);
  });

  // ── Step 3: Receive stock ──────────────────────────────────────────

  test("receive 50 units of Nuts M6 (restock from zero)", async ({ page }) => {
    await page.click("button.nav-item:has-text('Inventory')");
    await expect(topbarTitle(page)).toHaveText("Inventory");

    await page.click(".panel__actions button:has-text('Receive Stock')");
    await expect(page.locator(".action-panel h2")).toHaveText("Receive Stock");

    const form = page.locator(".action-panel");
    // Select the option containing "Nuts M6" by finding its value
    const itemSelect = form.locator("label:has-text('Select Item') select");
    const nutsOption = itemSelect.locator("option", { hasText: "Nuts M6" });
    const nutsValue = await nutsOption.getAttribute("value");
    await itemSelect.selectOption(nutsValue!);
    await form.locator("label:has-text('Quantity') input").fill("50");
    await form.locator("label:has-text('Reason') input").fill("Restock");
    await form.locator("label:has-text('Performed By') select").selectOption("Alice");

    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });

    // Verify the Nuts M6 row now shows qty 50
    const nutsRow = page.locator("tr", { has: page.locator("td:has-text('Nuts M6')") });
    await expect(nutsRow.locator(".cell-strong")).toHaveText("50");
  });

  // ── Step 4: Issue stock ────────────────────────────────────────────

  test("issue 85 units of Bolts M6 (triggers low stock)", async ({ page }) => {
    await page.click("button.nav-item:has-text('Inventory')");
    await expect(topbarTitle(page)).toHaveText("Inventory");

    await page.click(`button[aria-label="Issue Material: Bolts M6"]`);
    await expect(page.locator(".action-panel h2")).toHaveText("Issue Material");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Quantity') input").fill("85");
    await form.locator("label:has-text('Reason') input").fill("Production run");
    await form.locator("label:has-text('Performed By') select").selectOption("Bob");

    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner")).toBeVisible({ timeout: 10_000 });

    // Verify Bolts M6 now shows qty 15
    const boltsRow = page.locator("tr", { has: page.locator("td:has-text('Bolts M6')") });
    await expect(boltsRow.locator(".cell-strong")).toHaveText("15");
  });

  // ── Step 5: Verify dashboard and alerts ────────────────────────────

  test("dashboard shows correct metrics", async ({ page }) => {
    await page.click("button.nav-item:has-text('Dashboard')");
    await expect(page.locator(".metrics-grid")).toBeVisible();

    // Total Items = 3
    const totalItems = page.locator(".metric-card", { has: page.locator(".metric-card__label:has-text('Total Items')") });
    await expect(totalItems.locator(".metric-card__value")).toHaveText("3");

    // Low Stock >= 1
    const lowStock = page.locator(".metric-card", { has: page.locator(".metric-card__label:has-text('Low Stock')") });
    const lowStockValue = await lowStock.locator(".metric-card__value").textContent();
    expect(Number(lowStockValue)).toBeGreaterThanOrEqual(1);
  });

  test("alerts section shows low-stock alerts", async ({ page }) => {
    await page.click("button.nav-item:has-text('Alerts')");
    await expect(topbarTitle(page)).toHaveText("Alerts");

    // There should be alert cards
    await expect(page.locator(".alert-card").first()).toBeVisible({ timeout: 10_000 });

    // Verify at least one alert mentions an item we know is low
    const alertTexts = await page.locator(".alert-card").allTextContents();
    const hasRelevantAlert = alertTexts.some(
      (text) => text.includes("Bolts M6") || text.includes("Washers M6"),
    );
    expect(hasRelevantAlert).toBe(true);
  });
});
