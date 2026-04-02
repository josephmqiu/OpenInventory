import { test, expect } from "./fixtures/electron-app";
import { dismissBanner, expectSuccess, navigateTo } from "./fixtures/helpers";

const topbarTitle = (page: import("@playwright/test").Page) =>
  page.locator(".topbar h2");

test.describe.serial("inventory CRUD (empty seed)", () => {
  test("create an inventory item", async ({ page }) => {
    await navigateTo(page, "itemManagement");
    await expect(topbarTitle(page)).toHaveText("Item Management");

    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("E2E Widget");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Rack A");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("10");
    await form.locator("label:has-text('Initial Quantity') input").fill("50");

    await page.getByTestId("action-submit").click();
    await expectSuccess(page);

    // Verify the new row is visible in the table
    await expect(page.locator("td:has-text('E2E Widget')")).toBeVisible();
  });

  test("modify the item name and location", async ({ page }) => {
    const itemRow = page.locator("tr", {
      has: page.locator("td:has-text('E2E Widget')"),
    });
    await itemRow.locator("button:has-text('Modify Item')").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Modify Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("E2E Widget Mk II");
    await form.locator("label:has-text('Location') input").fill("Rack B");

    await page.getByTestId("action-submit").click();
    await expectSuccess(page);

    // Verify updated values in table
    await expect(page.locator("td:has-text('E2E Widget Mk II')")).toBeVisible();
    await expect(page.locator("td:has-text('Rack B')")).toBeVisible();
  });

  test("remove the item", async ({ page }) => {
    const itemRow = page.locator("tr", {
      has: page.locator("td:has-text('E2E Widget Mk II')"),
    });
    await itemRow.locator("button:has-text('Remove Item')").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Remove Inventory Item");

    await page.getByTestId("action-submit").click();
    await expectSuccess(page);

    // Verify item is gone from the table
    await expect(page.locator("td:has-text('E2E Widget Mk II')")).toHaveCount(0);
  });

  test("verify item is gone after navigating away", async ({ page }) => {
    await navigateTo(page, "inventory");
    await expect(topbarTitle(page)).toHaveText("Inventory");

    await expect(page.locator("td:has-text('E2E Widget Mk II')")).toHaveCount(0);
  });
});
