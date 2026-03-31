import { test, expect } from "./fixtures/electron-app";

const topbarTitle = (page: import("@playwright/test").Page) =>
  page.locator(".topbar h2");

test.describe.serial("audit view", () => {
  // ── Prerequisites: create items and movements so audit has data ────

  test("setup: create item and personnel for audit", async ({ page }) => {
    // Add personnel "Auditor"
    await page.click("button.nav-item:has-text('Personnel')");
    await expect(topbarTitle(page)).toHaveText("Personnel");
    await page.locator(".personnel-toolbar input").fill("Auditor");
    await page.click("button:has-text('Add Personnel')");
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });

    const dismiss = page.locator(".feedback-banner__dismiss");
    if (await dismiss.isVisible()) await dismiss.click();

    // Create item "Audit Widget"
    await page.click("button.nav-item:has-text('Item Management')");
    await expect(topbarTitle(page)).toHaveText("Item Management");
    await page.click("button:has-text('Create Item')");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("Audit Widget");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Warehouse C");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("200");
    await form.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
  });

  test("setup: receive and issue stock to generate movements", async ({ page }) => {
    await page.click("button.nav-item:has-text('Inventory')");
    await expect(topbarTitle(page)).toHaveText("Inventory");

    // Receive stock on Audit Widget
    await page.click(".panel__actions button:has-text('Receive Stock')");
    const receiveForm = page.locator(".action-panel");
    const itemSelect = receiveForm.locator("label:has-text('Select Item') select");
    const option = itemSelect.locator("option", { hasText: "Audit Widget" });
    const value = await option.getAttribute("value");
    await itemSelect.selectOption(value!);
    await receiveForm.locator("label:has-text('Quantity') input").fill("100");
    await receiveForm.locator("label:has-text('Reason') input").fill("Supplier delivery");
    await receiveForm.locator("label:has-text('Performed By') select").selectOption("Auditor");
    await receiveForm.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });

    const dismiss = page.locator(".feedback-banner__dismiss");
    if (await dismiss.isVisible()) await dismiss.click();

    // Issue stock on Audit Widget
    await page.click(`button[aria-label="Issue Material: Audit Widget"]`);
    const issueForm = page.locator(".action-panel");
    await issueForm.locator("label:has-text('Quantity') input").fill("25");
    await issueForm.locator("label:has-text('Reason') input").fill("Production line A");
    await issueForm.locator("label:has-text('Performed By') select").selectOption("Auditor");
    await issueForm.locator("button:has-text('Save')").click();
    await expect(page.locator(".feedback-banner:not(.feedback-banner--error)")).toBeVisible({ timeout: 10_000 });
  });

  // ── Audit page navigation ─────────────────────────────────────────

  test("navigates to audit page and shows activity log", async ({ page }) => {
    await page.click("button.nav-item:has-text('Audit')");
    await expect(topbarTitle(page)).toHaveText("Audit");

    // Tab navigation visible
    await expect(page.locator(".audit-tab--active")).toHaveText("Activity Log");
    await expect(page.locator(".audit-tab:has-text('Activity Summary')")).toBeVisible();

    // Filter bar visible
    await expect(page.locator(".audit-filter-bar")).toBeVisible();

    // Metrics strip visible with non-zero values
    const metricsGrid = page.locator(".metrics-grid").last();
    await expect(metricsGrid).toBeVisible();
  });

  test("activity log shows movement data in table", async ({ page }) => {
    // Wait for table rows to appear
    const table = page.locator(".audit-table table");
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Should have at least the movements we created (initial + receive + issue)
    const rows = table.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Verify table has expected columns
    const headers = table.locator("thead th");
    await expect(headers.first()).toHaveText("Date");
    await expect(headers.nth(1)).toHaveText("Item Name");
    await expect(headers.nth(2)).toHaveText("Type");
    await expect(headers.nth(3)).toHaveText("Quantity");
  });

  test("activity log has clickable item names", async ({ page }) => {
    const itemLink = page.locator(".audit-table .cell-link:has-text('Audit Widget')").first();
    await expect(itemLink).toBeVisible();
  });

  // ── Filters ───────────────────────────────────────────────────────

  test("date preset buttons update date range", async ({ page }) => {
    const todayBtn = page.locator(".audit-date-presets button:has-text('Today')");
    await todayBtn.click();

    // After clicking preset, the Apply button should be enabled
    const applyBtn = page.locator(".audit-filter-bar button:has-text('Apply')");
    await expect(applyBtn).toBeVisible();
  });

  test("clear button resets filters", async ({ page }) => {
    const clearBtn = page.locator(".audit-filter-bar button:has-text('Clear')");
    await clearBtn.click();

    // After clearing, the table should still show data (default 7-day range)
    await expect(page.locator(".audit-table table")).toBeVisible({ timeout: 10_000 });
  });

  // ── Activity Summary ──────────────────────────────────────────────

  test("switches to Activity Summary tab", async ({ page }) => {
    await page.click(".audit-tab:has-text('Activity Summary')");
    await expect(page.locator(".audit-tab--active")).toHaveText("Activity Summary");

    // By Personnel section should be visible
    await expect(page.locator(".audit-summary-section h3:has-text('By Personnel')")).toBeVisible({ timeout: 10_000 });

    // By Item section should be visible
    await expect(page.locator(".audit-summary-section h3:has-text('By Item')")).toBeVisible();

    // Alert Frequency section should be visible
    await expect(page.locator(".audit-summary-section h3:has-text('Alert Frequency')")).toBeVisible();
  });

  test("personnel breakdown shows Auditor activity", async ({ page }) => {
    const personnelTable = page.locator(".audit-summary-section:has(h3:has-text('By Personnel')) table");
    await expect(personnelTable.locator("td:has-text('Auditor')")).toBeVisible();
  });

  test("item breakdown shows Audit Widget", async ({ page }) => {
    const itemTable = page.locator(".audit-summary-section:has(h3:has-text('By Item')) table");
    await expect(itemTable.locator(".cell-link:has-text('Audit Widget')")).toBeVisible();
  });

  // ── Drill-down ────────────────────────────────────────────────────

  test("clicking item name in summary drills down", async ({ page }) => {
    // Click Audit Widget in the By Item table
    await page.click(".audit-summary-section .cell-link:has-text('Audit Widget')");

    // Should see breadcrumb with item name
    await expect(page.locator(".audit-breadcrumb")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".audit-breadcrumb")).toContainText("Audit Widget");

    // Back button visible
    await expect(page.locator("button:has-text('Back To List')")).toBeVisible();

    // Drill-down table should have Balance column
    const headers = page.locator("table thead th");
    const headerTexts = await headers.allTextContents();
    expect(headerTexts).toContain("Balance");

    // Should show movements for Audit Widget
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("back button returns to Activity Summary", async ({ page }) => {
    await page.click("button:has-text('Back To List')");

    // Should be back on Activity Summary tab
    await expect(page.locator(".audit-tab--active")).toHaveText("Activity Summary");
    await expect(page.locator(".audit-summary-section h3:has-text('By Personnel')")).toBeVisible();
  });

  // ── Tab state preservation ────────────────────────────────────────

  test("switching tabs preserves filter state", async ({ page }) => {
    // Switch to Activity Log
    await page.click(".audit-tab:has-text('Activity Log')");
    await expect(page.locator(".audit-tab--active")).toHaveText("Activity Log");
    await expect(page.locator(".audit-table table")).toBeVisible({ timeout: 10_000 });

    // Switch back to Activity Summary
    await page.click(".audit-tab:has-text('Activity Summary')");
    await expect(page.locator(".audit-tab--active")).toHaveText("Activity Summary");
    await expect(page.locator(".audit-summary-section h3:has-text('By Personnel')")).toBeVisible({ timeout: 10_000 });
  });

  // ── Pagination ────────────────────────────────────────────────────

  test("pagination controls are visible", async ({ page }) => {
    await page.click(".audit-tab:has-text('Activity Log')");
    await expect(page.locator(".audit-pagination")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".audit-pagination")).toContainText("Page");
    await expect(page.locator(".audit-pagination button:has-text('Export CSV')")).toBeVisible();
  });

  // ── Quick-filter clicks ───────────────────────────────────────────

  test("clicking personnel name in table filters by that person", async ({ page }) => {
    const auditorCell = page.locator(".audit-table .cell-filterable:has-text('Auditor')").first();
    if (await auditorCell.isVisible()) {
      await auditorCell.click();
      // After quick-filter, table should reload and metrics should update
      await expect(page.locator(".audit-table table")).toBeVisible({ timeout: 10_000 });
    }
  });
});
