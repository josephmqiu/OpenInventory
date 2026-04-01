import { test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

// lan-ready seed pre-configures: LAN enabled on port 19877, access key, items + personnel
const LAN_PORT = 19877;
const BASE_URL = `http://127.0.0.1:${LAN_PORT}`;
const ACCESS_KEY = "e2e-test-access-key-2026";

let boltsItemId = "";

test.describe.serial("QR code mobile issue flow", () => {
  test("resolve item ID from seeded data", async ({ page }) => {
    // Get item ID via API
    const res = await fetch(`${BASE_URL}/api/snapshot`, {
      headers: { "x-inventory-key": ACCESS_KEY },
    });
    expect(res.ok).toBe(true);
    const snapshot = await res.json() as { items: Array<{ id: string; name: string }> };
    boltsItemId = snapshot.items.find((i) => i.name === "Bolts M6")?.id ?? "";
    expect(boltsItemId).toBeTruthy();
  });

  test("mobile issue page loads with correct item details", async ({ browser }) => {
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

  test("preset buttons increment cumulatively and clear resets", async ({ browser }) => {
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

  test("submit issue updates stock and shows success", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await ctx.newPage();

    try {
      await mobilePage.goto(`${BASE_URL}/issue/${boltsItemId}`);
      await expect(mobilePage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });

      await mobilePage.getByTestId("qi-preset-5").click();
      await mobilePage.locator(".qi-form select").selectOption("Alice");
      await mobilePage.getByTestId("qi-submit").click();

      await expect(mobilePage.locator(".qi-feedback--success")).toBeVisible({ timeout: 10_000 });
      // Stock should update from 100 to 95
      await expect(mobilePage.locator(".qi-data-row--hero .qi-data-row__value")).toContainText("95");
    } finally {
      await ctx.close();
    }
  });
});
