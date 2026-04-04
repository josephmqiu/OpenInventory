import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { inventoryRow, navigateTo } from "./fixtures/helpers";

test.describe.serial("inventory discovery flows", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "dashboard");
    await navigateTo(page, "inventory");
    await expect(page.locator(".topbar h2")).toHaveText("Inventory");
    await page.getByRole("button", { name: /^All/i }).click();
    await page.locator(".inventory-search").fill("");
  });

  test("search narrows the inventory table by SKU and can be cleared", async ({ page }) => {
    const search = page.locator(".inventory-search");

    await search.fill("BOLTS");
    await expect(inventoryRow(page, "Bolts M6")).toBeVisible();
    await expect(inventoryRow(page, "Washers M6")).toHaveCount(0);
    await expect(inventoryRow(page, "Nuts M6")).toHaveCount(0);

    await search.fill("");
    await expect(inventoryRow(page, "Bolts M6")).toBeVisible();
    await expect(inventoryRow(page, "Washers M6")).toBeVisible();
    await expect(inventoryRow(page, "Nuts M6")).toBeVisible();
  });

  test("filter tabs show low-stock and out-of-stock subsets", async ({ page }) => {
    await page.getByRole("button", { name: /Low Stock/i }).click();
    await expect(inventoryRow(page, "Bolts M6")).toHaveCount(0);
    await expect(inventoryRow(page, "Washers M6")).toBeVisible();
    await expect(inventoryRow(page, "Nuts M6")).toHaveCount(0);

    await page.getByRole("button", { name: /Out of Stock/i }).click();
    await expect(inventoryRow(page, "Bolts M6")).toHaveCount(0);
    await expect(inventoryRow(page, "Washers M6")).toHaveCount(0);
    await expect(inventoryRow(page, "Nuts M6")).toBeVisible();
  });

  test("quantity sorting reorders visible rows", async ({ page }) => {
    const qtyHeader = page.locator("th.col-qty .th-sortable__button");
    const rowNames = page.locator("tbody tr .cell-title");

    await qtyHeader.click();
    await expect(qtyHeader.locator("..")).toHaveAttribute("aria-sort", "ascending");
    await expect(rowNames).toHaveText(["Nuts M6", "Washers M6", "Bolts M6"]);

    await qtyHeader.click();
    await expect(qtyHeader.locator("..")).toHaveAttribute("aria-sort", "descending");
    await expect(rowNames).toHaveText(["Bolts M6", "Washers M6", "Nuts M6"]);
  });

  test("selection actions can be cleared without mutating inventory", async ({ page }) => {
    await inventoryRow(page, "Bolts M6").locator("input[type='checkbox']").check();
    await inventoryRow(page, "Washers M6").locator("input[type='checkbox']").check();

    await expect(page.locator(".selection-count")).toContainText("2 selected");
    await expect(page.getByRole("button", { name: "Batch Issue" })).toBeEnabled();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator(".selection-count")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Create Item/i })).toBeVisible();
  });

  test("create item supports adding a custom category", async ({ page }) => {
    await page.getByRole("button", { name: /Create Item/i }).click();
    const form = page.locator(".action-panel");

    await expect(form.locator("h2")).toHaveText("Create Inventory Item");
    await form.locator("label:has-text('Item Name') input").fill("Spacers M8");
    await form.locator("label:has-text('Category') select").selectOption({ label: "Add New Category" });
    await form.locator("label:has-text('New Category Name') input").fill("Specialty Hardware");
    await form.locator("label:has-text('Location') input").fill("Rack C-02");
    await form.locator("label:has-text('Unit') select").selectOption("pcs");
    await form.locator("label:has-text('Reorder Level') input").fill("12");
    await form.locator("label:has-text('Initial Quantity') input").fill("24");

    await page.getByTestId("action-submit").click();
    await expect(page.getByTestId("feedback-banner")).toContainText("Inventory item created.", {
      timeout: 10_000,
    });

    const row = inventoryRow(page, "Spacers M8");
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId("item-details-panel")).toContainText("Specialty Hardware");
  });

  test("create and issue action panels can be cancelled cleanly", async ({ page }) => {
    await page.getByRole("button", { name: /Create Item/i }).click();
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".action-panel")).toHaveCount(0);

    await page.locator(".panel__actions").getByRole("button", { name: "Issue Material" }).click();
    await expect(page.locator(".action-panel h2")).toHaveText("Issue Material");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".action-panel")).toHaveCount(0);
  });

  test("modify, receive, and remove action panels can be cancelled cleanly", async ({ page }) => {
    const washersRow = inventoryRow(page, "Washers M6");
    await washersRow.click();
    await expect(page.getByTestId("item-details-panel")).toBeVisible();

    await page.getByRole("button", { name: "Modify Item" }).click();
    await expect(page.locator(".action-panel h2")).toHaveText("Modify Inventory Item");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".action-panel")).toHaveCount(0);

    await page.getByRole("button", { name: "Back To List" }).click();
    await expect(page.getByTestId("item-details-panel")).toHaveCount(0);

    await page.locator(".panel__actions").getByRole("button", { name: "Receive Stock" }).click();
    await expect(page.locator(".action-panel h2")).toHaveText("Receive Stock");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".action-panel")).toHaveCount(0);

    await washersRow.click();
    await expect(page.getByTestId("item-details-panel")).toBeVisible();
    await page.getByRole("button", { name: "Remove Item" }).click();
    await expect(page.locator(".action-panel h2")).toHaveText("Remove Inventory Item");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".action-panel")).toHaveCount(0);
  });
});
