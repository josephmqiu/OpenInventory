// Worker-shared `test`: every test here is read-only (LAN HTTP + fresh browser
// contexts; the desktop page is never mutated), so one Electron boot per worker
// is safe and avoids a cold boot per test.
import { test, expect } from "./fixtures/electron-app";
import { getLanItemIdByName, waitForLanReady } from "./fixtures/lan";
import { LAN_SCENARIOS, lanBaseUrl } from "./fixtures/lan-constants";

const BASE_URL = lanBaseUrl("no-personnel-lan");
const ACCESS_KEY = LAN_SCENARIOS["no-personnel-lan"].accessKey;

test.describe.serial("quick lookup edge states without personnel", () => {
  test("issue route without an item id lands on the searchable list", async ({ browser, page: _desktopPage }) => {
    await waitForLanReady(BASE_URL);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${BASE_URL}/issue/`);
      // No item id is no longer a dead-end: it lands on the searchable catalog
      // list (the generic "Inventory Lookup" entry), even with no personnel.
      await expect(page.locator(".qi-list")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-list__title")).toContainText(/inventory lookup/i);
      await expect(page.locator(".qi-list-row").first()).toBeVisible();
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
