import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { getLanItemIdByName, waitForLanReady } from "./fixtures/lan";

const LAN_PORT = 19878;
const BASE_URL = `http://127.0.0.1:${LAN_PORT}`;
const ACCESS_KEY = "e2e-no-personnel-key-2026";

test.describe.serial("quick lookup edge states without personnel", () => {
  test("issue route without an item id shows the no-item state", async ({ browser, page: _desktopPage }) => {
    await waitForLanReady(BASE_URL);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${BASE_URL}/issue/`);
      await expect(page.locator(".qi-state-screen")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-state-screen")).toContainText("No item specified");
    } finally {
      await ctx.close();
    }
  });

  test("public lookup page stays read-only when no personnel are configured", async ({ browser, page: _desktopPage }) => {
    await waitForLanReady(BASE_URL);
    const itemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${BASE_URL}/issue/${itemId}`);
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-header__name")).toHaveText("Bolts M6");
      await expect(page.locator(".qi-input-row input")).toHaveCount(0);
      await expect(page.locator(".qi-form select")).toHaveCount(0);
      await expect(page.locator(".qi-empty-state")).toHaveCount(0);
      await expect(page.getByTestId("qi-submit")).toHaveCount(0);
      await expect(page.getByTestId("qi-refresh")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
