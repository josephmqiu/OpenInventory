import { test, expect } from "./fixtures/electron-app";
// empty seed — no data needed for theme/language tests

test.describe.serial("theme and language", () => {
  // ── Theme cycling ──────────────────────────────────────────────────

  test("starts in auto mode", async ({ page }) => {
    const themeBtn = page.getByTestId("theme-toggle");
    await expect(themeBtn).toHaveAttribute("aria-label", "Auto");

    // Auto mode: no data-theme on <html> (defaults to dark unless system prefers light)
    const dataTheme = await page.locator("html").getAttribute("data-theme");
    expect(dataTheme === null || dataTheme === "light").toBe(true);
  });

  test("cycles to light mode", async ({ page }) => {
    await page.getByTestId("theme-toggle").click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "Light");
  });

  test("cycles to dark mode", async ({ page }) => {
    await page.getByTestId("theme-toggle").click();

    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "Dark");
    const dataTheme = await page.locator("html").getAttribute("data-theme");
    expect(dataTheme).toBeNull();
  });

  test("cycles back to auto mode", async ({ page }) => {
    await page.getByTestId("theme-toggle").click();

    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "Auto");
  });

  // ── Language switching ─────────────────────────────────────────────

  test("switches to Chinese and verifies labels", async ({ page }) => {
    // Navigate to Dashboard so we have a known section
    await page.getByTestId("nav-dashboard").click();
    await expect(page.locator("button.nav-item").first()).toHaveText("Dashboard");

    // Switch to Chinese
    await page.getByTestId("lang-toggle").click();

    // Verify nav items switched to Chinese
    await expect(page.locator("button.nav-item").first()).toHaveText("概览");
    await expect(page.locator(".topbar h2")).toHaveText("概览");

    // Verify other nav items
    await expect(page.locator("button.nav-item:has-text('库存')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('物料管理')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('预警')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('人员管理')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('设置')")).toBeVisible();

    // Verify section content in Chinese
    await page.locator("button.nav-item:has-text('人员管理')").click();
    await expect(page.locator(".topbar h2")).toHaveText("人员管理");

    // Theme button aria-label should be in Chinese
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "自动");
  });

  test("switches back to English", async ({ page }) => {
    await page.getByTestId("lang-toggle").click();

    await expect(page.locator("button.nav-item").first()).toHaveText("Dashboard");
    await expect(page.locator("button.nav-item:has-text('Inventory')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('Personnel')")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "Auto");
  });
});
