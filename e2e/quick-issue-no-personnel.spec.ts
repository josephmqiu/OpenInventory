import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { getLanItemIdByName, waitForLanReady } from "./fixtures/lan";

const LAN_PORT = 19878;
const BASE_URL = `http://127.0.0.1:${LAN_PORT}`;
const ACCESS_KEY = "e2e-no-personnel-key-2026";

test.describe.serial("quick issue edge states without personnel", () => {
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

  test("public issue page blocks issuing when no personnel are configured", async ({ browser, page: _desktopPage }) => {
    await waitForLanReady(BASE_URL);
    const itemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${BASE_URL}/issue/${itemId}`);
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-empty-state")).toContainText("No personnel configured");
      await page.locator(".qi-input-row input").fill("5");
      await expect(page.getByTestId("qi-submit")).toBeDisabled();
    } finally {
      await ctx.close();
    }
  });
});
