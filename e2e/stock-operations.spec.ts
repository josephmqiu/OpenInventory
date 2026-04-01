import { test, expect } from "./fixtures/electron-app";
import { dismissBanner, waitForBanner, expectSuccess, navigateTo } from "./fixtures/helpers";

test.describe.serial("stock operations", () => {
  // ── Test 1: Receive stock ────────────────────────────────────────────

  test("receive 50 units of Nuts M6", async ({ page }) => {
    await navigateTo(page, "inventory");

    // Open the Receive Stock form
    await page.locator(".panel__actions button:has-text('Receive Stock')").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Receive Stock");

    // Select Nuts M6 from the item dropdown
    const form = page.locator(".action-panel");
    const itemSelect = form.locator("label:has-text('Select Item') select");
    const nutsOption = itemSelect.locator("option", { hasText: "Nuts M6" });
    const nutsValue = await nutsOption.getAttribute("value");
    await itemSelect.selectOption(nutsValue!);

    // Fill in the form
    await form.locator("label:has-text('Quantity') input").fill("50");
    await form.locator("label:has-text('Reason') input").fill("Restock");
    await form.locator("label:has-text('Performed By') select").selectOption("Alice");

    // Submit
    await page.getByTestId("action-submit").click();
    await expectSuccess(page);

    // Verify Nuts M6 row shows updated quantity
    const nutsRow = page.locator("tr", { has: page.locator("td:has-text('Nuts M6')") });
    await expect(nutsRow.locator(".cell-strong")).toHaveText("50");
  });

  // ── Test 2: Issue stock triggers low stock ───────────────────────────

  test("issue 85 units of Bolts M6 triggers low stock", async ({ page }) => {
    await navigateTo(page, "inventory");

    // Click the issue button for Bolts M6
    await page.getByTestId("issue-btn-SKU-BOLTS-M6").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Issue Material");

    // Fill in the form
    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Quantity') input").fill("85");
    await form.locator("label:has-text('Reason') input").fill("Production");
    await form.locator("label:has-text('Performed By') select").selectOption("Bob");

    // Submit
    await page.getByTestId("action-submit").click();
    await waitForBanner(page);

    // Verify Bolts M6 row shows updated quantity (100 - 85 = 15)
    const boltsRow = page.locator("tr", { has: page.locator("td:has-text('Bolts M6')") });
    await expect(boltsRow.locator(".cell-strong")).toHaveText("15");

    await dismissBanner(page);
  });

  // ── Test 3: Batch issue across multiple items ────────────────────────

  test("batch issue across multiple items", async ({ page }) => {
    await navigateTo(page, "itemManagement");

    // Select Bolts M6 and Washers M6 checkboxes in the management table.
    // Rows have .cell-title div (not td) containing item names.
    const boltsRow = page.locator("tr", { has: page.locator(".cell-title:has-text('Bolts M6')") });
    const washersRow = page.locator("tr", { has: page.locator(".cell-title:has-text('Washers M6')") });

    await boltsRow.locator("input[type='checkbox']").check();
    await washersRow.locator("input[type='checkbox']").check();

    // Click the Batch Issue button (enabled once items are selected)
    const batchBtn = page.locator("button:has-text('Batch Issue')");
    await expect(batchBtn).toBeEnabled({ timeout: 5_000 });
    await batchBtn.click();

    // The BatchIssuePanel should now be visible
    const batchPanel = page.locator(".batch-issue-panel");
    await expect(batchPanel).toBeVisible({ timeout: 10_000 });

    // Wait for the batch table to populate with item rows
    await expect(batchPanel.locator("tbody tr")).toHaveCount(2, { timeout: 5_000 });

    // Fill quantities for each item in the batch table
    const batchBoltsInput = batchPanel
      .locator("tr", { has: page.locator(".cell-title:has-text('Bolts M6')") })
      .locator(".batch-issue-input");
    const batchWashersInput = batchPanel
      .locator("tr", { has: page.locator(".cell-title:has-text('Washers M6')") })
      .locator(".batch-issue-input");

    await batchBoltsInput.click();
    await batchBoltsInput.fill("5");
    await batchWashersInput.click();
    await batchWashersInput.fill("3");

    // Inventory polling refreshes the snapshot roughly every 2.5s. Verify the
    // form keeps user-entered values across at least one refresh cycle.
    await page.waitForTimeout(3_500);
    await expect(batchBoltsInput).toHaveValue("5");
    await expect(batchWashersInput).toHaveValue("3");

    // Select personnel and fill reason in the sidebar
    const sidebar = batchPanel.locator(".batch-issue-sidebar");
    await sidebar.locator("select").selectOption("Alice");
    await sidebar.locator(".batch-issue-field").nth(1).locator("input").fill("Batch production");

    // Submit
    await page.getByTestId("batch-submit").click();

    // Wait for any feedback (success or error) inside the batch panel
    await expect(batchPanel.locator(".feedback-banner").first()).toBeVisible({ timeout: 10_000 });
    // Verify it's the success banner, not an error
    await expect(batchPanel.locator(".feedback-banner--success")).toBeVisible();
  });

  // ── Test 4: Issue more than available shows error ────────────────────

  test("issue more than available shows error", async ({ page }) => {
    await navigateTo(page, "inventory");

    // Record current Nuts M6 quantity before attempting the issue
    const nutsRow = page.locator("tr", { has: page.locator("td:has-text('Nuts M6')") });
    const qtyBefore = await nutsRow.locator(".cell-strong").textContent();

    // Click the issue button for Nuts M6
    await page.getByTestId("issue-btn-SKU-NUTS-M6").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Issue Material");

    // Fill in an excessive quantity
    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Quantity') input").fill("999");
    await form.locator("label:has-text('Reason') input").fill("Test");
    await form.locator("label:has-text('Performed By') select").selectOption("Alice");

    // Submit
    await page.getByTestId("action-submit").click();

    // Verify an error feedback banner appears
    await expect(page.getByTestId("feedback-banner")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".feedback-banner--error")).toBeVisible();

    // Verify the stock quantity has NOT changed
    await expect(nutsRow.locator(".cell-strong")).toHaveText(qtyBefore!);

    await dismissBanner(page);
  });

  // ── Test 5: Dashboard shows correct metrics ──────────────────────────

  test("dashboard shows correct metrics", async ({ page }) => {
    await navigateTo(page, "dashboard");

    // Verify the metrics grid is visible
    await expect(page.locator(".metrics-grid")).toBeVisible();

    // Verify Total Items >= 3
    const totalItems = page.locator(".metric-card", {
      has: page.locator(".metric-card__label:has-text('Total Items')"),
    });
    await expect.poll(
      async () => Number(await totalItems.locator(".metric-card__value").textContent()),
    ).toBeGreaterThanOrEqual(3);

    // Verify Low Stock >= 1
    const lowStock = page.locator(".metric-card", {
      has: page.locator(".metric-card__label:has-text('Low Stock')"),
    });
    await expect.poll(
      async () => Number(await lowStock.locator(".metric-card__value").textContent()),
    ).toBeGreaterThanOrEqual(1);
  });

  // ── Test 6: Alerts section shows low-stock alerts ────────────────────

  test("alerts section shows low-stock alerts", async ({ page }) => {
    await navigateTo(page, "alerts");

    // Verify at least one alert card is visible
    await expect(page.locator(".alert-card").first()).toBeVisible({ timeout: 10_000 });

    // Verify alert text mentions one of the known low-stock items
    await expect.poll(async () => {
      const alertTexts = await page.locator(".alert-card").allTextContents();
      return alertTexts.some(
        (text) =>
          text.includes("Bolts M6") ||
          text.includes("Washers M6") ||
          text.includes("Nuts M6"),
      );
    }).toBe(true);
  });

  // ── Test 7: Item details panel shows movement history ────────────────

  test("item details panel shows movement history", async ({ page }) => {
    await navigateTo(page, "itemManagement");

    // Click the "View Details" button on the Bolts M6 row (which has movements
    // from the issue in test 2 and batch issue in test 3).
    const boltsRow = page.locator("tr", {
      has: page.locator("td.cell-title:has-text('Bolts M6')"),
    });
    await boltsRow.locator("button:has-text('View Details')").click();

    // Verify the item details panel is visible
    await expect(page.getByTestId("item-details-panel")).toBeVisible({ timeout: 10_000 });

    // Verify the movement history table is visible and has at least 1 row
    const movementTable = page.getByTestId("movement-history-table");
    await expect(movementTable).toBeVisible({ timeout: 10_000 });
    await expect(movementTable.locator("tbody tr").first()).toBeVisible();
  });
});
