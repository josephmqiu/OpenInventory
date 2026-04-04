import { isolatedTest as test, expect } from "./fixtures/electron-app";

test.describe("theme and language", () => {
  test("theme toggle cycles through auto, light, dark, and back to auto", async ({ page }) => {
    const themeBtn = page.getByTestId("theme-toggle");

    await expect(themeBtn).toHaveAttribute("aria-label", "Auto");

    await themeBtn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(themeBtn).toHaveAttribute("aria-label", "Light");

    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute("aria-label", "Dark");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");

    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute("aria-label", "Auto");
  });

  test("theme preference persists after reload in the desktop shell", async ({ page }) => {
    const themeBtn = page.getByTestId("theme-toggle");

    await themeBtn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await page.waitForSelector(".sidebar", { timeout: 30_000 });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(themeBtn).toHaveAttribute("aria-label", "Light");
  });

  test("language switch localizes navigation and backup controls", async ({ page }) => {
    await page.getByTestId("nav-dashboard").click();
    await expect(page.locator(".topbar h2")).toHaveText("Dashboard");

    await page.getByTestId("lang-toggle").click();

    await expect(page.locator("button.nav-item").first()).toHaveText("概览");
    await expect(page.locator(".topbar h2")).toHaveText("概览");
    await expect(page.locator("button.nav-item:has-text('库存')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('活动')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('设置')")).toBeVisible();

    await page.locator("button.nav-item:has-text('设置')").click();
    await page.getByRole("tab", { name: "备份" }).click();
    await expect(page.getByTestId("backup-now")).toContainText("立即备份");
    await expect(page.getByTestId("backup-restore")).toContainText("从备份恢复");
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "自动");
  });

  test("language switch can return to English from a localized shell", async ({ page }) => {
    await page.getByTestId("lang-toggle").click();
    await expect(page.locator("button.nav-item").first()).toHaveText("概览");

    await page.getByTestId("lang-toggle").click();
    await expect(page.locator("button.nav-item").first()).toHaveText("Dashboard");
    await expect(page.locator("button.nav-item:has-text('Inventory')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('Activity')")).toBeVisible();
    await expect(page.locator("button.nav-item:has-text('Settings')")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "Auto");
  });
});
