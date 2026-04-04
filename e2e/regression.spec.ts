import { test, expect } from "./fixtures/electron-app";
import { dismissBanner, navigateTo } from "./fixtures/helpers";

test.describe.serial("regression tests", () => {
  // ── Regression: bug #1 — low-stock alert creation after migration ────
  // syncLowStockAlert previously referenced the dropped channel_summary column.
  // This test verifies that issuing stock below the reorder point creates an
  // alert without crashing.

  test("low-stock alert creation works (channel_summary fix)", async ({ page }) => {
    await navigateTo(page, "inventory");

    // Issue enough Bolts M6 to drop below reorder level (reorder=10, start=100)
    await page.getByTestId("issue-btn-SKU-BOLTS-M6").click();
    await expect(page.locator(".action-panel h2")).toHaveText("Issue Material");

    const form = page.locator(".action-panel");
    await form.locator("label:has-text('Quantity') input").fill("95");
    await form.locator("label:has-text('Performed By') select").selectOption({ index: 1 });

    await page.getByTestId("action-submit").click();

    // Should get a warning banner mentioning low stock (not a crash)
    const banner = page.locator("[data-testid='feedback-banner']");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await dismissBanner(page);

    // Verify the item quantity is now 5
    const boltsRow = page.locator("tr", { has: page.locator("td:has-text('Bolts M6')") });
    await expect(boltsRow.locator(".cell-strong")).toHaveText("5");
  });

  // ── Regression: polling refactor — backup form stays editable ────────
  // BackupPanel form previously reset every 2-3s because backupPlan got a
  // new object reference on every poll tick. After the snapshotEquals fix,
  // the form should keep user edits while polling continues.

  test("backup settings form retains edits during polling", async ({ page }) => {
    await navigateTo(page, "settings");

    // Click the Backup tab under Settings
    await page.getByRole("tab", { name: "Backup" }).click();

    // Find the schedule number input and change it
    const intervalInput = page.locator("input.backup-schedule-number");
    await expect(intervalInput).toBeVisible({ timeout: 10_000 });
    await intervalInput.fill("12");

    // Wait for at least one poll cycle (3 seconds)
    await page.waitForTimeout(3500);

    // The interval value should still be 12 (not reset by polling)
    await expect(intervalInput).toHaveValue("12");
  });

  // ── Regression: bug #12 — batch issue notification for first item ────
  // batchIssueMaterial previously only kept the last low-stock notification,
  // silently dropping earlier ones. After the fix, the first triggered alert
  // is reported.

  test("batch issue reports low-stock notification", async ({ page }) => {
    await navigateTo(page, "inventory");
    const inventoryPanel = page.locator("section.panel").filter({ has: page.locator(".inventory-toolbar") });
    const receiveBtn = page.locator(".panel__actions button:has-text('Receive Stock')");

    await receiveBtn.click();
    let form = page.locator(".action-panel");
    await form.locator("label:has-text('Select Item') select").selectOption("item-bolts");
    await form.locator("label:has-text('Quantity') input").fill("100");
    await form.locator("label:has-text('Reason') input").fill("Regression setup");
    await form.locator("label:has-text('Performed By') select").selectOption("Alice");
    await page.getByTestId("action-submit").click();
    await dismissBanner(page);

    await receiveBtn.click();
    form = page.locator(".action-panel");
    await form.locator("label:has-text('Select Item') select").selectOption("item-nuts");
    await form.locator("label:has-text('Quantity') input").fill("10");
    await form.locator("label:has-text('Reason') input").fill("Regression setup");
    await form.locator("label:has-text('Performed By') select").selectOption("Alice");
    await page.getByTestId("action-submit").click();
    await dismissBanner(page);

    await page.locator("tr", { has: page.locator(".cell-title:has-text('Bolts M6')") }).locator("input[type='checkbox']").check();
    await page.locator("tr", { has: page.locator(".cell-title:has-text('Nuts M6')") }).locator("input[type='checkbox']").check();
    await page.getByRole("button", { name: "Batch Issue" }).click();
    const batchPanel = page.locator(".batch-issue-panel");
    await expect(batchPanel).toBeVisible({ timeout: 10_000 });

    const boltsInput = batchPanel
      .locator("tr", { has: page.locator(".cell-title:has-text('Bolts M6')") })
      .locator(".batch-issue-input");
    const nutsInput = batchPanel
      .locator("tr", { has: page.locator(".cell-title:has-text('Nuts M6')") })
      .locator(".batch-issue-input");

    await boltsInput.fill("90");
    await nutsInput.fill("6");
    await batchPanel.locator(".batch-issue-sidebar select").selectOption("Alice");
    await page.getByTestId("batch-submit").click();

    await expect(page.locator("[data-testid='feedback-banner']")).toContainText(/low-stock/i, {
      timeout: 10_000,
    });
    await expect(
      inventoryPanel.locator("tbody tr", { has: page.locator(".cell-title:has-text('Bolts M6')") }).locator(".cell-strong"),
    ).toHaveText("15");
    await expect(
      inventoryPanel.locator("tbody tr", { has: page.locator(".cell-title:has-text('Nuts M6')") }).locator(".cell-strong"),
    ).toHaveText("4");
  });
});
