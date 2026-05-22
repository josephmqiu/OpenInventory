import { test, expect } from "./fixtures/electron-app";
import { getLanItemIdByName, waitForLanReady } from "./fixtures/lan";
import type { Browser } from "@playwright/test";

// lan-mobile seed pre-configures: LAN enabled on port 19879, access key, items + personnel.
const LAN_PORT = 19879;
const BASE_URL = `http://127.0.0.1:${LAN_PORT}`;
const ACCESS_KEY = "e2e-mobile-access-key-2026";

async function openMobileLookup(browser: Browser, itemId: string) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/issue/${itemId}`);
  return { ctx, page };
}

test.describe.serial("QR code mobile lookup flow", () => {
  test("mobile lookup page renders item details and no mutation controls", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const { ctx, page } = await openMobileLookup(browser, boltsItemId);

    try {
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-header__name")).toHaveText("Bolts M6");
      await expect(page.locator(".qi-header__sku")).toHaveText("SKU-BOLTS-M6");
      await expect(page.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("100");
      await expect(page.locator(".qi-data-row", { hasText: "Category" })).toContainText("Raw Material");
      await expect(page.locator(".qi-data-row", { hasText: "Reorder" })).toContainText("20");

      await expect(page.locator(".qi-input-row input")).toHaveCount(0);
      await expect(page.locator(".qi-form select")).toHaveCount(0);
      await expect(page.getByTestId("qi-submit")).toHaveCount(0);
      await expect(page.getByTestId("qi-refresh")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("refresh reloads the read-only context", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const { ctx, page } = await openMobileLookup(browser, boltsItemId);
    let contextRequests = 0;

    await page.route(`${BASE_URL}/public/items/${boltsItemId}/context`, async (route) => {
      contextRequests += 1;
      await route.fallback();
    });

    try {
      await page.reload();
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("qi-refresh").click();
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => contextRequests).toBeGreaterThanOrEqual(2);
    } finally {
      await ctx.close();
    }
  });

  test("out-of-stock item shows the blocked status and refresh affordance", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const nutsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Nuts M6");
    const { ctx, page } = await openMobileLookup(browser, nutsItemId);

    try {
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-out-of-stock")).toContainText(/out of stock/i);
      await expect(page.getByTestId("qi-refresh")).toBeVisible();
      await expect(page.getByTestId("qi-submit")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("shows error for non-existent item ID", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${BASE_URL}/issue/nonexistent-id-12345`);
      const stateScreen = page.locator(".qi-state-screen");
      await expect(stateScreen).toBeVisible({ timeout: 10_000 });
      await expect(stateScreen).toContainText("not available in the current inventory database");
    } finally {
      await ctx.close();
    }
  });

  test("retry recovers after an initial context load failure", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    let failedOnce = false;

    await page.route(`${BASE_URL}/public/items/${boltsItemId}/context`, async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporary lookup failure", messageId: "serverError" }),
        });
        return;
      }
      await route.fallback();
    });

    try {
      await page.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(page.locator(".qi-state-screen")).toContainText(/operation failed/i, { timeout: 10_000 });
      await page.getByRole("button", { name: "Retry" }).click();
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-header__name")).toHaveText("Bolts M6");
    } finally {
      await ctx.close();
    }
  });

  test("theme selection persists after reload on the public lookup page", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const { ctx, page } = await openMobileLookup(browser, boltsItemId);

    try {
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await page.locator(".qi-topbar__controls button").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

      await page.reload();
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    } finally {
      await ctx.close();
    }
  });

  test("public issue POST is removed and stock remains unchanged", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const { ctx, page } = await openMobileLookup(browser, boltsItemId);

    try {
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("100");

      const status = await page.evaluate(async ({ baseUrl, itemId }) => {
        const response = await fetch(`${baseUrl}/public/items/${itemId}/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: 5, performedBy: "Alice", reason: "QR issue" }),
        });
        return response.status;
      }, { baseUrl: BASE_URL, itemId: boltsItemId });
      expect(status).toBe(404);

      await page.getByTestId("qi-refresh").click();
      await expect(page.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("100");
    } finally {
      await ctx.close();
    }
  });
});
