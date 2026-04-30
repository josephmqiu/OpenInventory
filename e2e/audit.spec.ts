import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";
import { installRendererDownloadCapture, readCapturedRendererDownload } from "./fixtures/downloads";

test.describe("audit features", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "activity");
    await expect(page.getByTestId("audit-tab-log")).toHaveClass(/filter-tab--active/);
  });

  test("navigates to audit and shows activity log", async ({ page }) => {
    const table = page.locator("table.audit-table");
    await expect(table).toBeVisible({ timeout: 15_000 });
    await expect(table.locator("tbody tr").nth(9)).toBeVisible();
  });

  test("activity log has correct columns", async ({ page }) => {
    const headers = page.locator("table.audit-table thead th");
    await expect(headers.nth(0)).toContainText("Date");
    await expect(headers.nth(1)).toContainText("Item Name");
    await expect(headers.nth(2)).toContainText("Type");
    await expect(headers.nth(3)).toContainText("Quantity");
    await expect(page.locator("table.audit-table tbody .cell-link").first()).toBeVisible();
  });

  test("date filter changes displayed results", async ({ page }) => {
    const table = page.locator("table.audit-table");
    const rowsBefore = await table.locator("tbody tr").count();

    await page.locator(".audit-date-presets button:has-text('Today')").click();
    await expect(async () => {
      const rowsAfter = await table.locator("tbody tr").count();
      expect(rowsAfter).not.toEqual(rowsBefore);
    }).toPass();

    await page.getByTestId("audit-filter-clear").click();
    await expect(table).toBeVisible();
  });

  test("switches between activity summary tabs", async ({ page }) => {
    await page.getByTestId("audit-tab-personnel").click();
    await expect(page.getByTestId("audit-tab-personnel")).toHaveClass(/filter-tab--active/);
    await expect(page.locator("table")).toBeVisible();

    await page.getByTestId("audit-tab-items").click();
    await expect(page.getByTestId("audit-tab-items")).toHaveClass(/filter-tab--active/);
    await expect(page.locator("table")).toBeVisible();

    await page.getByTestId("audit-tab-alerts").click();
    await expect(page.getByTestId("audit-tab-alerts")).toHaveClass(/filter-tab--active/);
    await expect(page.locator("table")).toBeVisible();
  });

  test("drill-down shows item balance sheet", async ({ page }) => {
    await page.getByTestId("audit-tab-items").click();

    const itemLink = page.locator(".cell-link").first();
    const itemName = await itemLink.textContent();
    await itemLink.click();

    await expect(page.locator(".audit-breadcrumb")).toContainText(itemName ?? "");
    await expect(page.getByRole("button", { name: "Back To List" })).toBeVisible();
    await expect(page.locator("table thead th:has-text('Balance')")).toBeVisible();

    await page.getByRole("button", { name: "Back To List" }).click();
    await expect(page.locator("table")).toBeVisible();
  });

  test("pagination shows page 2", async ({ page }) => {
    await page.locator(".audit-date-presets button:has-text('Last 30 Days')").click();

    const pagination = page.locator(".audit-pagination");
    await expect(pagination).toContainText("Page 1");
    await pagination.locator("button:has-text('Next')").click();
    await expect(pagination).toContainText("Page 2");
    await expect(page.locator("table.audit-table tbody tr").first()).toBeVisible();
  });

  test("CSV export produces a downloadable CSV payload with audit rows", async ({ page }) => {
    await installRendererDownloadCapture(page);

    const exportBtn = page.locator(".audit-pagination button:has-text('Export CSV')");
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    await expect.poll(() => readCapturedRendererDownload(page)).not.toBeNull();

    const capture = await readCapturedRendererDownload(page);
    expect(capture?.download).toMatch(/^audit-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(capture?.text).toContain('"Date","Item Name","SKU"');
    expect(capture?.text).toContain('"Bolts M6"');
  });

  test("delete movement removes an audit row and updates movement totals", async ({ page }) => {
    const totalMovements = page.locator(".metric-card", {
      has: page.locator(".metric-card__label", { hasText: "Total Movements" }),
    });
    const totalValue = totalMovements.locator(".metric-card__value");
    const initialTotal = Number(await totalValue.textContent());
    expect(initialTotal).toBeGreaterThan(0);

    const firstRow = page.locator("table.audit-table tbody tr").first();
    const firstRowText = await firstRow.textContent();
    await firstRow.getByRole("button", { name: "Delete Movement" }).click();

    const confirmDialog = page.locator(".confirm-dialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    await expect(totalValue).toHaveText(String(initialTotal - 1));
    await expect(firstRow).not.toHaveText(firstRowText ?? "");
  });

  test("filters by movement type", async ({ page }) => {
    const table = page.locator("table.audit-table");
    await page.getByTestId("audit-filter-clear").click();
    await page.locator(".audit-filter-bar select").first().selectOption("issue");
    await page.getByTestId("audit-filter-apply").click();

    await expect(table.locator("tbody tr").first()).toBeVisible();
    await expect(table.locator("tbody td:nth-child(3)").first()).toContainText(/issue/i);
  });

  test("text search input accepts input and apply button works", async ({ page }) => {
    const table = page.locator("table.audit-table");
    const textSearchInput = page.getByRole("textbox", { name: "Item Name or SKU" });
    await textSearchInput.fill("Bolts");
    await expect(textSearchInput).toHaveValue("Bolts");

    await page.getByTestId("audit-filter-apply").click();
    await expect(table).toBeVisible();
  });

  test("combined filters can be applied and then cleared back to the default range", async ({ page }) => {
    const table = page.locator("table.audit-table");
    await page.getByTestId("audit-filter-clear").click();

    await page.getByRole("textbox", { name: "Item Name or SKU" }).fill("Bolts");
    await page.locator(".audit-filter-bar select").first().selectOption("issue");
    await page.getByTestId("audit-filter-apply").click();

    await expect(table.locator("tbody tr").first()).toContainText("Bolts");
    await expect(table.locator("tbody td:nth-child(3)").first()).toContainText(/issue/i);

    await page.getByTestId("audit-filter-clear").click();
    await expect(page.getByRole("textbox", { name: "Item Name or SKU" })).toHaveValue("");
    await expect(table.locator("tbody tr").first()).toBeVisible();
  });

  test("non-matching filters show the filtered empty state", async ({ page }) => {
    await page.getByRole("textbox", { name: "Item Name or SKU" }).fill("definitely-not-a-real-item");
    await page.getByTestId("audit-filter-apply").click();
    await expect(page.locator(".empty-state")).toContainText("No movements match the current filters");
  });

  test("applies preset date range", async ({ page }) => {
    const dateFromInput = page.locator(".audit-date-range input[type='date']").first();
    const dateToInput = page.locator(".audit-date-range input[type='date']").last();
    const dateBefore = await dateFromInput.inputValue();

    const thisWeekBtn = page.locator(".audit-date-presets button:has-text('This Week')");
    await thisWeekBtn.click();

    await expect(async () => {
      const dateAfter = await dateFromInput.inputValue();
      expect(dateAfter).not.toEqual(dateBefore);
    }).toPass();

    const today = new Date().toISOString().slice(0, 10);
    await expect(dateToInput).toHaveValue(today);
    await expect(thisWeekBtn).toHaveClass(/audit-preset--active/);
  });
});

test.describe("audit resilience", () => {
  test.use({ seedScenario: "empty" });

  test("empty audit history shows the first-run empty state", async ({ page }) => {
    await navigateTo(page, "activity");
    await expect(page.locator(".empty-state")).toContainText("No movements recorded yet");
    await expect(page.locator(".empty-state")).toContainText("Receive or issue inventory to see activity here");
  });
});
