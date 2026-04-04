import { test, expect } from "./fixtures/electron-app";
import { getLanItemIdByName, waitForLanReady } from "./fixtures/lan";

// lan-mobile seed pre-configures: LAN enabled on port 19879, access key, items + personnel
const LAN_PORT = 19879;
const BASE_URL = `http://127.0.0.1:${LAN_PORT}`;
const ACCESS_KEY = "e2e-mobile-access-key-2026";

test.describe.serial("QR code mobile issue flow", () => {
  test("mobile issue page loads with correct item details", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(mobilePage.locator(".qi-header__name")).toHaveText("Bolts M6");
      await expect(mobilePage.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("100");
    } finally {
      await ctx.close();
    }
  });

  test("preset buttons increment cumulatively and clear resets", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await mobilePage.getByTestId("qi-preset-5").click();
      await mobilePage.getByTestId("qi-preset-10").click();

      const input = mobilePage.locator(".qi-input-row input");
      await expect(input).toHaveValue("15");

      // Clear resets
      await mobilePage.getByTestId("qi-preset-clear").click();
      await expect(input).toHaveValue("");
    } finally {
      await ctx.close();
    }
  });

  test("manual quantity above the current stock keeps submit disabled", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await mobilePage.locator(".qi-input-row input").fill("150");
      await mobilePage.locator(".qi-form select").selectOption("Alice");

      await expect(mobilePage.getByTestId("qi-submit")).toBeDisabled();
    } finally {
      await ctx.close();
    }
  });

  test("manual zero quantity stays blocked even after personnel is selected", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await mobilePage.locator(".qi-input-row input").fill("0");
      await mobilePage.locator(".qi-form select").selectOption("Alice");

      await expect(mobilePage.getByTestId("qi-submit")).toBeDisabled();
    } finally {
      await ctx.close();
    }
  });

  test("out-of-stock item shows the blocked state and refresh affordance", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const nutsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Nuts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${nutsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(mobilePage.locator(".qi-out-of-stock")).toContainText(/out of stock/i);
      await expect(mobilePage.locator(".qi-refresh-btn")).toBeVisible();
      await expect(mobilePage.getByTestId("qi-submit")).toBeDisabled();
    } finally {
      await ctx.close();
    }
  });

  test("shows error for non-existent item ID", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/nonexistent-id-12345`);

      // The state screen should show the "item not found" message
      const stateScreen = mobilePage.locator(".qi-state-screen");
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
    const mobilePage = await ctx.newPage();
    let failedOnce = false;

    await mobilePage.route(`${BASE_URL}/public/items/${boltsItemId}/context`, async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporary issue", messageId: "serverError" }),
        });
        return;
      }
      await route.fallback();
    });

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-state-screen")).toContainText(/operation failed/i, { timeout: 10_000 });
      await mobilePage.getByRole("button", { name: "Retry" }).click();
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(mobilePage.locator(".qi-header__name")).toHaveText("Bolts M6");
    } finally {
      await ctx.close();
    }
  });

  test("theme selection persists after reload on the public issue page", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await mobilePage.locator(".qi-topbar__controls button").click();
      await expect(mobilePage.locator("html")).toHaveAttribute("data-theme", "light");

      await mobilePage.reload();
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(mobilePage.locator("html")).toHaveAttribute("data-theme", "light");
    } finally {
      await ctx.close();
    }
  });

  test("submit issue updates stock and shows success", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const boltsItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Bolts M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await mobilePage.getByTestId("qi-preset-5").click();
      await mobilePage.locator(".qi-form select").selectOption("Alice");
      await mobilePage.getByTestId("qi-submit").click();

      await expect(mobilePage.locator(".qi-feedback--success")).toBeVisible({ timeout: 10_000 });
      await expect(mobilePage.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("95");
    } finally {
      await ctx.close();
    }
  });

  test("submit stays disabled while the public issue request is in flight", async ({ browser, app: _app }) => {
    await waitForLanReady(BASE_URL);
    const washersItemId = await getLanItemIdByName(BASE_URL, ACCESS_KEY, "Washers M6");
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    await mobilePage.route(`${BASE_URL}/public/items/${washersItemId}/issue`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fallback();
    });

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${washersItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await mobilePage.getByTestId("qi-preset-5").click();
      await mobilePage.locator(".qi-form select").selectOption("Alice");
      await mobilePage.getByTestId("qi-submit").click();

      await expect(mobilePage.getByTestId("qi-submit")).toBeDisabled();
      await expect(mobilePage.locator(".qi-feedback--success")).toBeVisible({ timeout: 10_000 });
      await expect(mobilePage.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("3");
    } finally {
      await ctx.close();
    }
  });
});
