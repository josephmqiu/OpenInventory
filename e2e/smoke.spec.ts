import { test, expect } from "./fixtures/electron-app";
import { navigateTo, dismissWelcomeScreen } from "./fixtures/helpers";

const topbarTitle = (page: import("@playwright/test").Page) =>
  page.locator(".topbar h2");

test.describe.serial("smoke tests (empty seed)", () => {
  test("dismiss welcome screen on empty database", async ({ page }) => {
    await dismissWelcomeScreen(page);
  });

  test("all 7 sidebar nav sections render", async ({ page }) => {
    const sections: Array<{ id: string; title: string }> = [
      { id: "dashboard", title: "Dashboard" },
      { id: "inventory", title: "Inventory" },
      { id: "itemManagement", title: "Item Management" },
      { id: "alerts", title: "Alerts" },
      { id: "audit", title: "Audit" },
      { id: "personnel", title: "Personnel" },
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

    // Table should exist but have zero body rows, or an empty state message is shown
    const table = page.locator("table");
    const emptyState = page.locator(".empty-state, .no-data, [class*='empty']");
    const bodyRows = table.locator("tbody tr");

    const hasTable = await table.count();
    if (hasTable > 0) {
      await expect(bodyRows).toHaveCount(0);
    } else {
      await expect(emptyState.first()).toBeVisible();
    }
  });

  test("empty personnel section shows no cards", async ({ page }) => {
    await navigateTo(page, "personnel");
    await expect(topbarTitle(page)).toHaveText("Personnel");

    await expect(page.locator(".personnel-card")).toHaveCount(0);
  });

  test("empty alerts section shows no alert cards", async ({ page }) => {
    await navigateTo(page, "alerts");
    await expect(topbarTitle(page)).toHaveText("Alerts");

    await expect(page.locator(".alert-card")).toHaveCount(0);
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
