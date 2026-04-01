import { test, expect } from "./fixtures/electron-app";

test.describe.serial("theme and language", () => {
  // ── Theme cycling ──────────────────────────────────────────────────

  test("starts in auto mode (no data-theme attribute)", async ({ page }) => {
    const themeBtn = page.locator(".topbar__controls button[aria-label]").first();
    await expect(themeBtn).toHaveAttribute("aria-label", "Auto");

    // Auto mode: no data-theme on <html> (defaults to dark unless system prefers light)
    const dataTheme = await page.locator("html").getAttribute("data-theme");
    // In auto mode it's either "light" or absent depending on system preference
    expect(dataTheme === null || dataTheme === "light").toBe(true);
  });

  test("cycles to light mode", async ({ page }) => {
    const themeBtn = page.locator(".topbar__controls button[aria-label='Auto']");
    await themeBtn.click();

    // After clicking auto → goes to light
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".topbar__controls button[aria-label='Light']")).toBeVisible();
  });

  test("cycles to dark mode", async ({ page }) => {
    const themeBtn = page.locator(".topbar__controls button[aria-label='Light']");
    await themeBtn.click();

    // After clicking light → goes to dark (no data-theme attribute)
    await expect(page.locator(".topbar__controls button[aria-label='Dark']")).toBeVisible();
    const dataTheme = await page.locator("html").getAttribute("data-theme");
    expect(dataTheme).toBeNull();
  });

  test("cycles back to auto mode", async ({ page }) => {
    const themeBtn = page.locator(".topbar__controls button[aria-label='Dark']");
    await themeBtn.click();

    await expect(page.locator(".topbar__controls button[aria-label='Auto']")).toBeVisible();
  });

  // ── Language switching ─────────────────────────────────────────────

  test("switches to Chinese (zh-CN)", async ({ page }) => {
    // Navigate to Dashboard so we have a known section
    await page.click("button.nav-item:has-text('Dashboard')");
    await expect(page.locator("button.nav-item").first()).toHaveText("Dashboard");

    // Switch to Chinese via language toggle button (shows "中" when in English)
    await page.click(".topbar__controls button:has-text('中')");

    // Verify nav items switched to Chinese
    await expect(page.locator("button.nav-item").first()).toHaveText("概览");

    // Verify topbar title switched
    await expect(page.locator(".topbar h2")).toHaveText("概览");

    // Verify other nav items
    await expect(page.locator("button.nav-item:has-text('库存')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('物料管理')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('预警')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('人员管理')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('设置')")).toBeVisible();
  });

  test("Chinese labels apply to section content", async ({ page }) => {
    // Navigate to a section and verify content is in Chinese
    await page.click("button.nav-item:has-text('人员管理')");
    await expect(page.locator(".topbar h2")).toHaveText("人员管理");
  });

  test("switches back to English", async ({ page }) => {
    // Click language toggle (shows "EN" when in Chinese)
    await page.click(".topbar__controls button:has-text('EN')");

    // Verify nav items back to English
    await expect(page.locator("button.nav-item").first()).toHaveText("Dashboard");
    await expect(page.locator("button.nav-item:has-text('Inventory')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('Personnel')")).toBeVisible();
  });

  test("theme button labels update with language", async ({ page }) => {
    // Switch to Chinese
    await page.click(".topbar__controls button:has-text('中')");

    // Theme button aria-label should now be in Chinese
    const themeBtn = page.locator(".topbar__controls button[aria-label='自动']");
    await expect(themeBtn).toBeVisible();

    // Switch back to English
    await page.click(".topbar__controls button:has-text('EN')");
    await expect(page.locator(".topbar__controls button[aria-label='Auto']")).toBeVisible();
  });
});
