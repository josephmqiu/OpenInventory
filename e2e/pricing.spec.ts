import { test, expect } from "./fixtures/electron-app";
import { dismissBanner, expectSuccess, inventoryRow, navigateTo } from "./fixtures/helpers";

// pricing seed: app.currency=CNY, app.language=en, items with distinct prices plus
// one null-price item (Gizmo):
//   Bolts M6  ¥12.50 (1250)   Nuts M6  ¥5.99 (599)
//   Washers M6 ¥88.00 (8800)  Gizmo    — (null)
//
// Worker-shared serial, but structured so the read tests (1-4) are independent of
// the mutation arc (5-7): the read tests run first against the seeded items, and the
// create→modify→clear arc operates on its OWN throwaway item ("Priced Widget"). A
// failure in the create arc therefore cannot corrupt the read tests.
//
// en + Intl: CNY formats as "CN¥12.50" (contains ¥), USD as "$12.50". Switching
// currency must change the symbol but NOT the number (v1 never rescales stored
// minor units — see formatters.ts).

// Both the SKU column ("cell-mono cell-truncate") and the price column
// ("cell-mono") use .cell-mono; price is the last cell-mono in the row.
const priceCell = (page: import("@playwright/test").Page, itemName: string) =>
  inventoryRow(page, itemName).locator("td.cell-mono").last();

test.describe.serial("item pricing and currency", () => {
  test("price column shows formatted prices and — for items without a price", async ({ page }) => {
    await navigateTo(page, "inventory");

    await expect(priceCell(page, "Bolts M6")).toContainText("12.50");
    await expect(priceCell(page, "Bolts M6")).toContainText("¥");
    await expect(priceCell(page, "Nuts M6")).toContainText("5.99");
    await expect(priceCell(page, "Washers M6")).toContainText("88.00");
    await expect(priceCell(page, "Gizmo")).toHaveText("—");
  });

  test("sorting by price puts null prices first ascending and last descending", async ({ page }) => {
    await navigateTo(page, "inventory");

    // Configurable columns moved widths from CSS `.col-price` classes to px
    // ColumnDef widths, so target the sortable button by its header text.
    const priceHeader = page.locator("thead .th-sortable__button", { hasText: "Price" });
    const rowNames = page.locator("tbody tr .cell-title");

    await priceHeader.click();
    await expect(priceHeader.locator("..")).toHaveAttribute("aria-sort", "ascending");
    // null (sort key -1) is smallest → Gizmo first, then 599, 1250, 8800.
    await expect(rowNames).toHaveText(["Gizmo", "Nuts M6", "Bolts M6", "Washers M6"]);

    await priceHeader.click();
    await expect(priceHeader.locator("..")).toHaveAttribute("aria-sort", "descending");
    await expect(rowNames).toHaveText(["Washers M6", "Bolts M6", "Nuts M6", "Gizmo"]);
  });

  test("item details panel shows the formatted price", async ({ page }) => {
    await navigateTo(page, "inventory");
    await inventoryRow(page, "Bolts M6").click();

    const panel = page.getByTestId("item-details-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("12.50");
    await expect(panel).toContainText("¥");

    await page.getByRole("button", { name: /Back To List/i }).click();
  });

  test("switching currency reformats prices without changing the number and persists", async ({ page }) => {
    // Sanity: starts in CNY.
    await navigateTo(page, "inventory");
    await expect(priceCell(page, "Bolts M6")).toContainText("¥");

    // Switch to USD on the (default) general settings tab.
    await navigateTo(page, "settings");
    await page.getByTestId("currency-select").selectOption("USD");

    // Live reformat: the symbol changes to $, the NUMBER 12.50 is unchanged, no ¥.
    await navigateTo(page, "inventory");
    await expect(priceCell(page, "Bolts M6")).toContainText("$");
    await expect(priceCell(page, "Bolts M6")).toContainText("12.50");
    await expect(priceCell(page, "Bolts M6")).not.toContainText("¥");

    // Persists across reload.
    await page.reload();
    await page.waitForSelector(".sidebar", { timeout: 30_000 });
    await navigateTo(page, "inventory");
    await expect(priceCell(page, "Bolts M6")).toContainText("$");
    await expect(priceCell(page, "Bolts M6")).toContainText("12.50");

    // Restore CNY so the spec ends in a known currency.
    await navigateTo(page, "settings");
    await page.getByTestId("currency-select").selectOption("CNY");
    await navigateTo(page, "inventory");
    await expect(priceCell(page, "Bolts M6")).toContainText("¥");
  });

  // ── Mutation arc on a dedicated throwaway item ──────────────────────────────

  test("create an item with a price persists and displays it", async ({ page }) => {
    await navigateTo(page, "inventory");
    await page.click("button:has-text('Create Item')");
    await expect(page.locator(".action-panel h2")).toHaveText("Create Inventory Item");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("Priced Widget");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Rack P");
    const unitSelect = form.locator(".unit-group select");
    if (await unitSelect.count()) {
      await unitSelect.selectOption("pcs");
    } else {
      await form.locator(".unit-group input").fill("pcs");
    }
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("10");
    await form.locator("label:has-text('Price') input").fill("12.50");

    await page.getByTestId("action-submit").click();
    await expectSuccess(page);

    await expect(priceCell(page, "Priced Widget")).toContainText("12.50");
    await expect(priceCell(page, "Priced Widget")).toContainText("¥");
  });

  test("modifying then clearing the price updates the display", async ({ page }) => {
    const backToList = page.locator("[data-testid='item-details-panel'] button:has-text('Back To List')");

    // Modify: 12.50 → 20.00. Modify is launched from the details panel, which stays
    // open over the table after submit, so return to the list before asserting/clicking.
    await navigateTo(page, "inventory");
    await inventoryRow(page, "Priced Widget").click();
    await page.locator("[data-testid='item-details-panel'] button:has-text('Modify Item')").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Modify Inventory Item");
    const priceInput = page.locator(".action-panel label:has-text('Price') input");
    await expect(priceInput).toHaveValue("12.50");
    await priceInput.fill("20.00");
    await page.getByTestId("action-submit").click();
    await expectSuccess(page);
    await backToList.click();
    await expect(priceCell(page, "Priced Widget")).toContainText("20.00");

    // Clear: 20.00 → "" (null) → shows —
    await inventoryRow(page, "Priced Widget").click();
    await page.locator("[data-testid='item-details-panel'] button:has-text('Modify Item')").click();
    await page.locator(".action-panel label:has-text('Price') input").fill("");
    await page.getByTestId("action-submit").click();
    await expectSuccess(page);
    await backToList.click();
    await expect(priceCell(page, "Priced Widget")).toHaveText("—");
  });

  test("invalid prices are rejected and no item is created", async ({ page }) => {
    await navigateTo(page, "inventory");
    await page.click("button:has-text('Create Item')");
    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Item Name') input").fill("Reject Widget");
    await form.locator("label:has-text('Category') select").selectOption("Raw Material");
    await form.locator("label:has-text('Location') input").fill("Rack R");
    const unitSelect = form.locator(".unit-group select");
    if (await unitSelect.count()) {
      await unitSelect.selectOption("pcs");
    } else {
      await form.locator(".unit-group input").fill("pcs");
    }
    await form.locator("label:has-text('Reorder Level') input").fill("5");
    await form.locator("label:has-text('Initial Quantity') input").fill("10");

    const errorBanner = page.locator("[data-testid='feedback-banner'].feedback-banner--error");

    // Over-precision for a 2-decimal currency.
    await form.locator("label:has-text('Price') input").fill("1.234");
    await page.getByTestId("action-submit").click();
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText("valid price");
    await dismissBanner(page);

    // Negative price.
    await form.locator("label:has-text('Price') input").fill("-5");
    await page.getByTestId("action-submit").click();
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText("valid price");
    await dismissBanner(page);

    // Abandon the form; the rejected item must not exist.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(inventoryRow(page, "Reject Widget")).toHaveCount(0);
  });
});
