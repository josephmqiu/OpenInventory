import { test, expect } from "./fixtures/electron-app";
import { navigateTo, expectSuccess, dismissBanner } from "./fixtures/helpers";

// lan-ready seed pre-configures: LAN enabled on port 19877, access key "e2e-test-access-key-2026"
const LAN_PORT = 19877;
const BASE_URL = `http://127.0.0.1:${LAN_PORT}`;
const SEEDED_KEY = "e2e-test-access-key-2026";

async function fetchSnapshot(key: string) {
  const response = await fetch(`${BASE_URL}/api/snapshot`, {
    headers: { "x-inventory-key": key },
  });
  return { ok: response.ok, status: response.status };
}

test.describe.serial("LAN access and QR codes", () => {
  test("LAN access panel shows running status", async ({ page }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("lan-status")).toContainText("Running", { timeout: 10_000 });

    // Verify at least one URL link is displayed
    await expect(lanPanel.locator("a[href^='http']").first()).toBeVisible({ timeout: 5_000 });
  });

  test("workspace browser access requires valid access key", async ({ browserPage }) => {
    await browserPage.goto(BASE_URL);
    await expect(browserPage.locator(".auth-card")).toBeVisible({ timeout: 10_000 });
    await expect(browserPage.locator(".sidebar")).toHaveCount(0);

    await browserPage.locator(".auth-card__field input").fill(SEEDED_KEY);
    await browserPage.locator("button:has-text('Connect')").click();

    await expect(browserPage.locator(".sidebar")).toBeVisible({ timeout: 10_000 });
    await expect(browserPage.locator(".topbar h2")).toHaveText("Dashboard");
  });

  test("invalid access key is rejected", async ({ browser }) => {
    const context = await browser.newContext();
    const invalidPage = await context.newPage();

    try {
      await invalidPage.goto(BASE_URL);
      await expect(invalidPage.locator(".auth-card")).toBeVisible({ timeout: 10_000 });

      await invalidPage.locator(".auth-card__field input").fill("wrong-key-12345");
      await invalidPage.locator("button:has-text('Connect')").click();

      // Should remain on auth screen (sidebar should NOT appear)
      await expect(invalidPage.locator(".auth-card")).toBeVisible({ timeout: 5_000 });
      await expect(invalidPage.locator(".sidebar")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("access key regeneration invalidates old key", async ({ page }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    // Click regenerate key button
    await page.getByTestId("lan-regen-key").click();
    await expectSuccess(page);

    // Get the new key from the input
    const newKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();
    expect(newKey).toBeTruthy();
    expect(newKey).not.toBe(SEEDED_KEY);

    // Old key should fail
    const oldResult = await fetchSnapshot(SEEDED_KEY);
    expect(oldResult.ok).toBe(false);

    // New key should work
    const newResult = await fetchSnapshot(newKey);
    expect(newResult.ok).toBe(true);
  });

  test("public issue page works without auth", async ({ browser, page }) => {
    // Get an item ID from the snapshot using the regenerated key
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    const currentKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();

    const res = await fetch(`${BASE_URL}/api/snapshot`, {
      headers: { "x-inventory-key": currentKey },
    });
    const snapshot = await res.json() as { items: Array<{ id: string; name: string; currentQuantity: number }> };
    const bolts = snapshot.items.find((i) => i.name === "Bolts M6");
    expect(bolts).toBeTruthy();

    const context = await browser.newContext();
    const publicPage = await context.newPage();

    try {
      await publicPage.goto(`${BASE_URL}/issue/${bolts!.id}`);
      await expect(publicPage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await publicPage.locator(".qi-input-row input").fill("3");
      await publicPage.locator(".qi-form select").selectOption("Alice");
      await publicPage.locator("[data-testid='qi-submit']").click();

      await expect(publicPage.locator(".qi-feedback--success").first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test("disable LAN and verify stopped status", async ({ page }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    await lanPanel.locator("select").first().selectOption("disabled");
    await page.getByTestId("lan-save").click();
    await expectSuccess(page);

    await expect(page.getByTestId("lan-status")).toContainText("Stopped", { timeout: 10_000 });
  });
});
