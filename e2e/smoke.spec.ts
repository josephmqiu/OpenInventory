// Worker-shared `test`: smoke runs against the empty seed and every test is
// read-only (navigation + empty-state assertions, no mutations), so one Electron
// boot per worker is safe. Each test self-navigates; the beforeEach lands on a
// known section so a prior test's route can't leak.
import { test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

const topbarTitle = (page: import("@playwright/test").Page) =>
  page.locator(".topbar h2");

test.describe.serial("smoke tests (empty seed)", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "dashboard");
  });

  test("all 4 sidebar nav sections render", async ({ page }) => {
    const sections: Array<{ id: string; title: string }> = [
      { id: "dashboard", title: "Dashboard" },
      { id: "inventory", title: "Inventory" },
      { id: "activity", title: "Activity" },
      { id: "settings", title: "Settings" },
    ];

    for (const section of sections) {
      await page.getByTestId(`nav-${section.id}`).click();
      await expect(topbarTitle(page)).toHaveText(section.title, { timeout: 5_000 });
    }
  });

  test("empty inventory table shows no-data state", async ({ page }) => {

    await navigateTo(page, "inventory");
    await expect(topbarTitle(page)).toHaveText("Inventory");

    // On the empty seed, UnifiedInventoryTable renders the DataTable empty state
    // (DataTable.tsx:102) with the "no inventory records" title — not a table with
    // zero rows. Assert that real DOM directly (no silent if/else branch).
    await expect(page.locator(".empty-state")).toBeVisible();
    await expect(page.locator(".empty-state")).toContainText("No inventory records yet.");
    await expect(page.locator("tbody tr")).toHaveCount(0);
  });

  test("empty personnel section shows no cards", async ({ page }) => {

    await navigateTo(page, "settings");
    await expect(topbarTitle(page)).toHaveText("Settings");

    // Click the Personnel sub-tab inside Settings
    await page.getByRole("tab", { name: "Personnel" }).click();

    await expect(page.locator(".empty-state")).toBeVisible();
  });

  test("empty alerts section shows empty state", async ({ page }) => {

    await navigateTo(page, "dashboard");
    await expect(topbarTitle(page)).toHaveText("Dashboard");

    // Dashboard shows empty states for movements and alerts when no data exists
    await expect(page.locator(".empty-state").first()).toBeVisible();
  });

  test("no quick-issue CSS classes in desktop DOM", async ({ page }) => {

    await navigateTo(page, "dashboard");
    await expect(topbarTitle(page)).toHaveText("Dashboard");

    // No elements with quick-issue or qi- CSS classes
    const quickIssueElements = await page
      .locator("[class*='quick-issue'], [class*='qi-']")
      .count();
    expect(quickIssueElements).toBe(0);

    // Page content should not contain these component references
    const html = await page.content();
    expect(html).not.toContain("quick-issue-panel");
    expect(html).not.toContain("QuickIssuePage");
  });
});
