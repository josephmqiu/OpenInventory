import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

test.describe.serial("dashboard drill-through flows", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "inventory");
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
