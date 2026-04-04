import { test, expect } from "./fixtures/electron-app";
import { dismissBanner, expectSuccess, navigateTo } from "./fixtures/helpers";

const topbarTitle = (page: import("@playwright/test").Page) =>
  page.locator(".topbar h2");

test.describe.serial("inventory CRUD (empty seed)", () => {
  test("create an inventory item", async ({ page }) => {
    await navigateTo(page, "inventory");
    await expect(topbarTitle(page)).toHaveText("Inventory");

    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("E2E Widget");
    await form.locator("label:has-text('Category') input").fill("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Rack A");
    await form.locator("label:has-text('Unit') input").fill("pcs");
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
    await itemRow.click();
    await expect(page.getByTestId("item-details-panel")).toBeVisible();
    await page.locator("[data-testid='item-details-panel'] button:has-text('Modify Item')").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Modify Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("E2E Widget Mk II");
    await form.locator("label:has-text('Location') input").fill("Rack B");

    await page.getByTestId("action-submit").click();
    await expectSuccess(page);

    // Close the details panel so only the management table has <td> elements
    await page.locator("[data-testid='item-details-panel'] button:has-text('Back To List')").click();

    // Verify updated values in table
    await expect(page.locator("td:has-text('E2E Widget Mk II')")).toBeVisible();
    await expect(page.locator("td:has-text('Rack B')")).toBeVisible();
  });

  test("remove the item", async ({ page }) => {
    const itemRow = page.locator("tr", {
      has: page.locator("td:has-text('E2E Widget Mk II')"),
    });
    await itemRow.click();
    await expect(page.getByTestId("item-details-panel")).toBeVisible();
    await page.locator("[data-testid='item-details-panel'] button:has-text('Remove Item')").click();
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

  test("shows validation error when creating item without required fields", async ({ page }) => {
    await navigateTo(page, "inventory");
    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");

    // Leave name empty, submit immediately
    await page.getByTestId("action-submit").click();

    // Error banner should appear with the validation message
    const errorBanner = page.locator("[data-testid='feedback-banner'].feedback-banner--error");
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText("Check the required fields");
    await dismissBanner(page);
  });

  test("shows error for duplicate SKU", async ({ page }) => {
    await navigateTo(page, "inventory");

    // Create first item with explicit SKU
    // On empty DB, category and unit show plain text inputs (no dropdown yet)
    await page.click("button:has-text('Create Item')");
    const form = page.locator(".action-panel");
    await form.locator("label:has-text('SKU') input").fill("DUP-SKU-001");
    await form.locator("label:has-text('Item Name') input").fill("First Item");
    await form.locator("label:has-text('Category') input").fill("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Rack A");
    await form.locator("label:has-text('Unit') input").fill("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("20");
    await page.getByTestId("action-submit").click();
    await expectSuccess(page);

    // Create second item with the same SKU
    await page.click("button:has-text('Create Item')");
    const form2 = page.locator(".action-panel");
    await form2.locator("label:has-text('SKU') input").fill("DUP-SKU-001");
    await form2.locator("label:has-text('Item Name') input").fill("Second Item");
    await form2.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form2.locator("label:has-text('Location') input").fill("Rack B");
    await form2.locator("label:has-text('Unit') select").selectOption("pcs");
    await form2.locator("label:has-text('Reorder Level') input").fill("5");
    await form2.locator("label:has-text('Initial Quantity') input").fill("10");
    await page.getByTestId("action-submit").click();

    // Error banner should appear with duplicate SKU message
    const errorBanner = page.locator("[data-testid='feedback-banner'].feedback-banner--error");
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText("SKU already exists");
    await dismissBanner(page);
  });
});
