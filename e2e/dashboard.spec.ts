// Worker-shared `test`: every test here is read-only (drill-through navigation,
// no DB mutation), so one Electron boot per worker is safe. The beforeEach resets
// shared UI state a prior test's drill-through can leave behind (inventory filter
// tab, search text, row selection, open details panel) so order can't leak.
import { test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

test.describe.serial("dashboard drill-through flows", () => {
  test.beforeEach(async ({ page }) => {
    // Reset inventory view state, then land on a clean dashboard.
    await navigateTo(page, "inventory");
    const backToList = page.getByRole("button", { name: /Back To List/i });
    if (await backToList.count()) await backToList.first().click();
    await page.getByRole("button", { name: /^All/i }).click();
    await page.locator(".inventory-search").fill("");
    const clearSelection = page.getByRole("button", { name: "Clear" });
    if (await clearSelection.count()) await clearSelection.first().click();
    await navigateTo(page, "dashboard");
    await expect(page.locator(".topbar h2")).toHaveText("Dashboard");
  });

  test("low stock metric card drills into filtered inventory", async ({ page }) => {
    await page.getByRole("button", { name: "Low Stock" }).click();
    await expect(page.locator(".topbar h2")).toHaveText("Inventory");
    await expect(page.getByRole("button", { name: /Low Stock/i })).toHaveClass(/filter-tab--active/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Washers M6");
  });

  test("open alerts metric card switches the dashboard to alerts tab", async ({ page }) => {
    await page.getByRole("button", { name: "Open Alerts" }).click();
    await expect(page.getByRole("button", { name: /Alerts/i })).toHaveClass(/filter-tab--active/);
    await expect(page.locator(".dashboard-view .table--fixed tbody tr").first()).toBeVisible();
  });

  test("recent alert row opens the item details panel", async ({ page }) => {
    const washersAlertRow = page.locator(".dashboard-view .table--fixed").nth(1).locator("tbody tr", {
      has: page.locator("text=Washers M6"),
    }).first();

    await washersAlertRow.click();
    await expect(page.locator(".topbar h2")).toHaveText("Inventory");
    await expect(page.getByTestId("item-details-panel")).toBeVisible();
    await expect(page.getByTestId("item-details-panel")).toContainText("Washers M6");
  });
});
