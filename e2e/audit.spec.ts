import { test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

test.describe.serial("audit features", () => {
  test("navigates to audit and shows activity log", async ({ page }) => {
    await navigateTo(page, "audit");

    // Activity Log tab should be active by default
    const logTab = page.getByTestId("audit-tab-log");
    await expect(logTab).toHaveClass(/audit-tab--active/);

    // Table should be visible with data rows
    const table = page.locator(".audit-table table");
    await expect(table).toBeVisible();

    const rows = table.locator("tbody tr");
    await expect(rows.nth(9)).toBeVisible();
  });

  test("activity log has correct columns", async ({ page }) => {
    const table = page.locator(".audit-table table");
    const headers = table.locator("thead th");

    await expect(headers.nth(0)).toHaveText("Date");
    await expect(headers.nth(1)).toHaveText("Item Name");
    await expect(headers.nth(2)).toHaveText("Type");
    await expect(headers.nth(3)).toHaveText("Quantity");

    // Item names are clickable links
    const itemLinks = table.locator("tbody .cell-link");
    await expect(itemLinks.first()).toBeVisible();
  });

  test("date filter changes displayed results", async ({ page }) => {
    // Count rows before applying the "Today" preset
    const table = page.locator(".audit-table table");
    const rowsBefore = await table.locator("tbody tr").count();

    // Click "Today" preset — this calls applyPreset() which fires onFiltersChange immediately
    const todayBtn = page.locator(".audit-date-presets button:has-text('Today')");
    await todayBtn.click();

    // Wait for the table to re-render; row count should differ from the 7-day default
    // because movements span 30 days, so "Today" shows only today's subset
    await expect(async () => {
      const rowsAfter = await table.locator("tbody tr").count();
      expect(rowsAfter).not.toEqual(rowsBefore);
    }).toPass();

    // Clear filters to reset back to defaults
    await page.getByTestId("audit-filter-clear").click();
    await expect(table).toBeVisible();
  });

  test("switches to Activity Summary tab", async ({ page }) => {
    await page.getByTestId("audit-tab-summary").click();

    // Active tab should change
    const summaryTab = page.getByTestId("audit-tab-summary");
    await expect(summaryTab).toHaveClass(/audit-tab--active/);

    // All three summary sections should be visible
    await expect(page.locator(".audit-summary-section h3:has-text('By Personnel')")).toBeVisible();
    await expect(page.locator(".audit-summary-section h3:has-text('By Item')")).toBeVisible();
    await expect(page.locator(".audit-summary-section h3:has-text('Alert Frequency')")).toBeVisible();
  });

  test("drill-down shows item balance sheet", async ({ page }) => {
    // Click an item name in the By Item summary table
    const byItemSection = page.locator(".audit-summary-section:has(h3:has-text('By Item'))");
    const itemLink = byItemSection.locator(".cell-link").first();
    const itemName = await itemLink.textContent();
    await itemLink.click();

    // Breadcrumb should appear with the item name
    const breadcrumb = page.locator(".audit-breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText(itemName!);

    // "Back To List" button should be visible
    await expect(page.locator("button:has-text('Back To List')")).toBeVisible();

    // Drill-down table should have a "Balance" column header
    await expect(page.locator("table thead th:has-text('Balance')")).toBeVisible();

    // Return to the summary view
    await page.locator("button:has-text('Back To List')").click();
    await expect(page.locator(".audit-summary-section h3:has-text('By Item')")).toBeVisible();
  });

  test("pagination shows page 2", async ({ page }) => {
    // Switch back to the Activity Log tab
    await page.getByTestId("audit-tab-log").click();
    await expect(page.locator(".audit-table table")).toBeVisible();

    // Use "Last 30 Days" preset so all 55 movements are in range (pageSize=50 means 2 pages)
    const last30Btn = page.locator(".audit-date-presets button:has-text('Last 30 Days')");
    await last30Btn.click();

    // Pagination element should be visible with page info
    const pagination = page.locator(".audit-pagination");
    await expect(pagination).toBeVisible();
    await expect(pagination).toContainText("Page 1");

    // Click "Next" to go to page 2
    const nextBtn = pagination.locator("button:has-text('Next')");
    await nextBtn.click();

    // Should now show page 2
    await expect(pagination).toContainText("Page 2");

    // Table should still have rows on page 2
    const rowsPage2 = page.locator(".audit-table table tbody tr");
    await expect(rowsPage2.first()).toBeVisible();
  });

  test("CSV export button is visible and clickable", async ({ page }) => {
    // The Export CSV button lives inside .audit-pagination__controls
    const exportBtn = page.locator(".audit-pagination button:has-text('Export CSV')");
    await expect(exportBtn).toBeVisible();

    // Click to verify it does not error (actual file download cannot be asserted in Electron)
    await exportBtn.click();

    // The table should remain visible after export (no crash or navigation)
    await expect(page.locator(".audit-table table")).toBeVisible();
  });
});
