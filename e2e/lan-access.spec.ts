import { test, expect } from "./fixtures/electron-app";
import { connectLanBrowser, navigateTo, expectSuccess, dismissBanner } from "./fixtures/helpers";

// lan-access seed pre-configures: LAN enabled on port 19877, access key "e2e-lan-access-key-2026"
const LAN_PORT = 19877;
const BASE_URL = `http://127.0.0.1:${LAN_PORT}`;
const SEEDED_KEY = "e2e-lan-access-key-2026";

async function fetchSnapshot(key: string) {
  const response = await fetch(`${BASE_URL}/api/snapshot`, {
    headers: { "x-inventory-key": key },
  });
  return { ok: response.ok, status: response.status };
}

test.describe.serial("LAN access and QR codes", () => {
  test("LAN access panel shows running status", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "LAN Access" }).click();
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("lan-status")).toContainText("Running", { timeout: 10_000 });

    // Verify at least one URL link is displayed
    await expect(lanPanel.locator("a[href^='http']").first()).toBeVisible({ timeout: 5_000 });
  });

  test("workspace browser access requires valid access key", async ({ browserPage }) => {
    await browserPage.goto(BASE_URL);
    await expect(browserPage.locator(".sidebar")).toHaveCount(0);
    await connectLanBrowser(browserPage, SEEDED_KEY);
    await expect(browserPage.locator(".sidebar")).toBeVisible({ timeout: 10_000 });
    await expect(browserPage.locator(".topbar h2")).toHaveText("Dashboard");
  });

  test("browser disconnect returns to auth and can reconnect with the same key", async ({ browserPage }) => {
    await browserPage.goto(BASE_URL);
    await connectLanBrowser(browserPage, SEEDED_KEY);
    await expect(browserPage.locator(".sidebar")).toBeVisible({ timeout: 10_000 });

    await browserPage.getByRole("button", { name: "Disconnect" }).click();
    await expect(browserPage.locator(".auth-card")).toBeVisible({ timeout: 10_000 });
    await expect(browserPage.locator(".sidebar")).toHaveCount(0);

    await connectLanBrowser(browserPage, SEEDED_KEY);
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

  test("browser activity view can retry after a failed audit request", async ({ browser }) => {
    const context = await browser.newContext();
    const activityPage = await context.newPage();
    let failedOnce = false;
    let auditRequests = 0;

    await activityPage.route(/\/api\/audit\/movements\?/, async (route) => {
      auditRequests += 1;
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Audit unavailable." }),
        });
        return;
      }

      await route.fallback();
    });

    try {
      await activityPage.goto(BASE_URL);
      await connectLanBrowser(activityPage, SEEDED_KEY);
      await activityPage.getByTestId("nav-activity").click();
      await expect(activityPage.locator(".feedback-banner--error")).toContainText("Audit unavailable.");

      await activityPage.getByRole("button", { name: "Retry" }).click();
      await expect(activityPage.locator(".feedback-banner--error")).toHaveCount(0);
      await expect.poll(() => auditRequests).toBeGreaterThanOrEqual(2);
    } finally {
      await context.close();
    }
  });

  test("access key regeneration invalidates old key", async ({ page }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    // Click regenerate key button and confirm
    await page.getByTestId("lan-regen-key").click();
    await page.getByTestId("regen-dialog-confirm").click();
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

  test("regenerating the key forces an existing browser session to re-authenticate", async ({ page, browser }) => {
    const context = await browser.newContext();
    const connectedPage = await context.newPage();

    try {
      await navigateTo(page, "settings");
      const lanPanel = page.locator(".panel:has-text('LAN Access')");
      const currentKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();

      await connectedPage.goto(BASE_URL);
      await connectLanBrowser(connectedPage, currentKey);
      await expect(connectedPage.locator(".sidebar")).toBeVisible({ timeout: 10_000 });

      const oldKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();
      await page.getByTestId("lan-regen-key").click();
      await page.getByTestId("regen-dialog-confirm").click();
      await expectSuccess(page);

      const newKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();
      expect(newKey).not.toBe(oldKey);

      await connectedPage.reload();
      await expect(connectedPage.locator(".auth-card")).toBeVisible({ timeout: 10_000 });
      await connectLanBrowser(connectedPage, newKey);
      await expect(connectedPage.locator(".sidebar")).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test("stale persisted browser auth is cleared after an unauthorized response", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript((storedKey) => {
      window.localStorage.setItem("inventory-monitor.lan-access-key", storedKey);
    }, SEEDED_KEY);
    const stalePage = await context.newPage();

    try {
      await stalePage.goto(BASE_URL);
      await expect(stalePage.locator(".auth-card")).toBeVisible({ timeout: 10_000 });
      await expect(stalePage.locator(".sidebar")).toHaveCount(0);
      const persistedKey = await stalePage.evaluate(() =>
        window.localStorage.getItem("inventory-monitor.lan-access-key"),
      );
      expect(persistedKey).toBeNull();
    } finally {
      await context.close();
    }
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

  test("LAN port validation prevents saving invalid values", async ({ page }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    const portInput = lanPanel.locator("input[type='number']");
    await portInput.fill("0");
    await expect(page.getByTestId("lan-save")).toBeDisabled();

    await portInput.fill("70000");
    await expect(page.getByTestId("lan-save")).toBeDisabled();
  });

  test("copy access key shows success and failure feedback", async ({ page }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => undefined,
        },
      });
    });
    await lanPanel.getByRole("button", { name: "Copy" }).click();
    await expect(lanPanel.locator(".feedback-banner--success")).toContainText("copied");

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("clipboard denied");
          },
        },
      });
    });
    await lanPanel.getByRole("button", { name: "Copy" }).click();
    await expect(lanPanel.locator(".feedback-banner--error")).toContainText("Unable to copy");
  });

  test("disable LAN and verify stopped status", async ({ page }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    await expect(lanPanel).toBeVisible({ timeout: 10_000 });

    // Toggle switch OFF to disable LAN (click the visible track, not the hidden input)
    await lanPanel.locator(".toggle-switch__track").click();
    await expectSuccess(page);

    await expect(page.getByTestId("lan-status")).toContainText("Stopped", { timeout: 10_000 });
  });
});
