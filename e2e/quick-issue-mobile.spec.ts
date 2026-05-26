import { test, expect } from "./fixtures/electron-app";
import { getLanItemIdByName, waitForLanReady } from "./fixtures/lan";
import { LAN_SCENARIOS, lanBaseUrl } from "./fixtures/lan-constants";
import type { Browser } from "@playwright/test";

// lan-mobile seed pre-configures LAN enabled on the lan-mobile port + key, items + personnel.
const BASE_URL = lanBaseUrl("lan-mobile");
const ACCESS_KEY = LAN_SCENARIOS["lan-mobile"].accessKey;

async function openMobileLookup(browser: Browser, itemId: string) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/issue/${itemId}`);
  return { ctx, page };
}

async function openList(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  // No item id → the generic lookup landing (the list), not a dead-end.
  await page.goto(`${BASE_URL}/issue/`);
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

  test("refresh re-fetches the catalog", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const { ctx, page } = await openMobileLookup(browser, boltsItemId);
    let catalogRequests = 0;

    // The mobile page is catalog-first: detail is derived from GET /public/items,
    // and the refresh button re-fetches that catalog (not the single-item endpoint).
    await page.route(`${BASE_URL}/public/items`, async (route) => {
      catalogRequests += 1;
      await route.fallback();
    });

    try {
      await page.reload();
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("qi-refresh").click();
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => catalogRequests).toBeGreaterThanOrEqual(2);
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

  test("a scanned item still loads via the single-item fallback when the catalog fails", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    // Catalog endpoint is down, but the single-item context endpoint works.
    // A scanned item must still render via the fallback (QuickIssueApp precedence).
    await page.route(`${BASE_URL}/public/items`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ messageId: "serverError" }),
      });
    });

    try {
      await page.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-header__name")).toHaveText("Bolts M6");
    } finally {
      await ctx.close();
    }
  });

  test("retry recovers after an initial load failure", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    let contextFailedOnce = false;

    // Catalog down → app falls back to /context, which fails once then recovers,
    // exercising the error screen + Retry on the fallback path.
    await page.route(`${BASE_URL}/public/items`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ messageId: "serverError" }),
      });
    });
    await page.route(`${BASE_URL}/public/items/${boltsItemId}/context`, async (route) => {
      if (!contextFailedOnce) {
        contextFailedOnce = true;
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

  // NOTE: the "public issue POST → 404 / stock unchanged" assertion lives in
  // lan-access.spec.ts ("public lookup page works without auth and cannot mutate
  // stock"). It was duplicated here; kept in lan-access as the security-boundary
  // home so this mobile spec stays focused on the lookup UX.

  // ---- Browse + search ----
  // Kept in this SAME describe.serial so it shares the one Electron app + LAN
  // port. A second describe.serial races a 2nd app onto the same seed port under
  // parallel workers → 429 / rate-limit lockout. lan-mobile seeds three items,
  // one per status: Bolts M6 (in_stock) · Washers M6 (low_stock) · Nuts M6 (out_of_stock).
  test("opening the lookup with no item lands on the searchable list", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const { ctx, page } = await openList(browser);

    try {
      await expect(page.locator(".qi-list")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".qi-list__title")).toContainText(/inventory lookup/i);
      await expect(page.locator(".qi-list-row")).toHaveCount(3);
    } finally {
      await ctx.close();
    }
  });

  test("search narrows the list by name/SKU and clears", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const { ctx, page } = await openList(browser);

    try {
      await expect(page.locator(".qi-list-row")).toHaveCount(3);
      await page.getByRole("searchbox").fill("bolt");
      await expect(page.locator(".qi-list-row")).toHaveCount(1);
      await expect(page.locator(".qi-list-row")).toContainText("Bolts M6");
      await page.getByRole("searchbox").fill("");
      await expect(page.locator(".qi-list-row")).toHaveCount(3);
    } finally {
      await ctx.close();
    }
  });

  test("status chips filter the list", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const { ctx, page } = await openList(browser);

    try {
      await page.locator(".qi-list__chip", { hasText: "Low Stock" }).click();
      await expect(page.locator(".qi-list-row")).toHaveCount(1);
      await expect(page.locator(".qi-list-row")).toContainText("Washers M6");

      await page.locator(".qi-list__chip", { hasText: "Out of Stock" }).click();
      await expect(page.locator(".qi-list-row")).toHaveCount(1);
      await expect(page.locator(".qi-list-row")).toContainText("Nuts M6");

      await page.locator(".qi-list__chip", { hasText: "All" }).click();
      await expect(page.locator(".qi-list-row")).toHaveCount(3);
    } finally {
      await ctx.close();
    }
  });

  test("View all from a scanned item, open a result, and the query persists on return", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    try {
      await page.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(page.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await page.getByTestId("qi-view-all").click();
      await expect(page.locator(".qi-list")).toBeVisible();

      await page.getByRole("searchbox").fill("washers");
      await expect(page.locator(".qi-list-row")).toHaveCount(1);
      await page.locator(".qi-list-row", { hasText: "Washers M6" }).click();

      await expect(page.locator(".qi-card")).toBeVisible();
      await expect(page.locator(".qi-header__name")).toHaveText("Washers M6");

      // Returning to the list preserves the search query (lifted, persistent state).
      await page.getByTestId("qi-view-all").click();
      await expect(page.getByRole("searchbox")).toHaveValue("washers");
      await expect(page.locator(".qi-list-row")).toHaveCount(1);
    } finally {
      await ctx.close();
    }
  });
});
