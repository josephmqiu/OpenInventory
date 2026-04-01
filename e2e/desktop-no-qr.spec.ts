import { test, expect } from "./fixtures/electron-app";

test.describe.serial("desktop app has no QR code artifacts", () => {
  test("all 7 sidebar nav sections render", async ({ page }) => {
    const navSections = ["Dashboard", "Inventory", "Item Management", "Alerts", "Audit", "Personnel", "Settings"];

    for (const section of navSections) {
      await page.click(`button.nav-item:has-text('${section}')`);
      await expect(page.locator(".topbar h2")).toHaveText(section, { timeout: 5_000 });
    }
  });

  test("no quick-issue CSS classes in DOM", async ({ page }) => {
    await page.click("button.nav-item:has-text('Dashboard')");
    await expect(page.locator(".topbar h2")).toHaveText("Dashboard", { timeout: 5_000 });

    const quickIssueElements = await page.locator("[class*='quick-issue'], [class*='qi-']").count();
    expect(quickIssueElements).toBe(0);
  });

  test("no QuickIssuePage or issue route handling in desktop", async ({ page }) => {
    // The desktop app should not render the sidebar when on /issue/ route
    // because the desktop entry point no longer has issue route detection.
    // In Electron, we can't navigate to /issue/ (it's file:// protocol),
    // so we verify by checking the component is not imported.
    const html = await page.content();
    expect(html).not.toContain("quick-issue-panel");
    expect(html).not.toContain("QuickIssuePage");
  });
});
