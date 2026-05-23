import { test, expect } from "./fixtures/electron-app";
import { navigateTo, expectSuccess } from "./fixtures/helpers";
import { LAN_SCENARIOS, lanBaseUrl } from "./fixtures/lan-constants";

// lan-access seed pre-configures LAN enabled on the lan-access port + key.
const LAN_PORT = LAN_SCENARIOS["lan-access"].port;
const BASE_URL = lanBaseUrl("lan-access");
const SEEDED_KEY = LAN_SCENARIOS["lan-access"].accessKey;
const LAN_GOTO_OPTIONS = { waitUntil: "domcontentloaded" as const, timeout: 20_000 };

async function fetchSnapshot(key: string) {
  const response = await fetch(`${BASE_URL}/api/snapshot`, {
    headers: { "x-inventory-key": key },
  });
  return { ok: response.ok, status: response.status };
}

async function fetchLanApi(path: string, key?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: key ? { "x-inventory-key": key } : undefined,
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

  test("production LAN browser does not serve the admin app", async ({ browserPage }) => {
    await expect.poll(() => fetchSnapshot(SEEDED_KEY).then((result) => result.ok).catch(() => false)).toBe(true);

    for (const path of ["/", "/index.html", "/inventory"]) {
      const response = await browserPage.goto(`${BASE_URL}${path}`, LAN_GOTO_OPTIONS);
      expect(response?.status(), `${path} should not expose the admin shell`).toBe(404);
      await expect(browserPage.locator(".sidebar")).toHaveCount(0);
      await expect(browserPage.locator(".auth-card")).toHaveCount(0);
    }
  });

  test("authenticated LAN API accepts the current key and rejects missing or invalid keys", async () => {
    await expect.poll(() => fetchSnapshot(SEEDED_KEY).then((result) => result.ok).catch(() => false)).toBe(true);

    const noKey = await fetchLanApi("/api/snapshot");
    expect(noKey.status).toBe(401);

    const wrongKey = await fetchLanApi("/api/snapshot", "wrong-key-12345");
    expect(wrongKey.status).toBe(401);

    const validKey = await fetchLanApi("/api/snapshot", SEEDED_KEY);
    expect(validKey.ok).toBe(true);
  });

  test("authenticated LAN read APIs remain available without a browser admin UI", async () => {
    await expect.poll(() => fetchSnapshot(SEEDED_KEY).then((result) => result.ok).catch(() => false)).toBe(true);

    const audit = await fetchLanApi("/api/audit/movements?page=1&pageSize=10", SEEDED_KEY);
    expect(audit.ok).toBe(true);

    const health = await fetchLanApi("/api/health", SEEDED_KEY);
    expect(health.ok).toBe(true);
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

  test("admin browser routes stay unavailable after key regeneration", async ({ page, browserPage }) => {
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    const oldKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();

    await page.getByTestId("lan-regen-key").click();
    await page.getByTestId("regen-dialog-confirm").click();
    await expectSuccess(page);

    const newKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();
    expect(newKey).not.toBe(oldKey);
    expect((await fetchSnapshot(oldKey)).status).toBe(401);
    expect((await fetchSnapshot(newKey)).ok).toBe(true);

    const response = await browserPage.goto(BASE_URL, LAN_GOTO_OPTIONS);
    expect(response?.status()).toBe(404);
    await expect(browserPage.locator(".sidebar")).toHaveCount(0);
    await expect(browserPage.locator(".auth-card")).toHaveCount(0);
  });

  test("public lookup page works without auth and cannot mutate stock", async ({ browser, page }) => {
    // Get an item ID from the snapshot using the regenerated key
    await navigateTo(page, "settings");
    const lanPanel = page.locator(".panel:has-text('LAN Access')");
    const currentKey = await lanPanel.locator("label:has-text('Access Key') input").inputValue();

    const res = await fetch(`${BASE_URL}/api/snapshot`, {
      headers: { "x-inventory-key": currentKey },
    });
    const snapshot = await res.json() as { items: Array<{ id: string; name: string; sku: string; currentQuantity: number }> };
    const bolts = snapshot.items.find((i) => i.name === "Bolts M6");
    expect(bolts).toBeTruthy();
    const startingQuantity = bolts!.currentQuantity;

    const context = await browser.newContext();
    const publicPage = await context.newPage();

    try {
      await publicPage.goto(`${BASE_URL}/issue/${bolts!.id}`, LAN_GOTO_OPTIONS);
      await expect(publicPage.locator(".qi-card")).toBeVisible({ timeout: 10_000 });
      await expect(publicPage.locator(".qi-header__name")).toHaveText("Bolts M6");
      await expect(publicPage.locator(".qi-header__sku")).toHaveText(bolts!.sku);
      await expect(publicPage.locator(".qi-data-row--hero .qi-data-row__value")).toContainText(String(startingQuantity));
      await expect(publicPage.locator(".qi-input-row input")).toHaveCount(0);
      await expect(publicPage.locator(".qi-form select")).toHaveCount(0);
      await expect(publicPage.locator("[data-testid='qi-submit']")).toHaveCount(0);

      const issueStatus = await publicPage.evaluate(async ({ baseUrl, itemId }) => {
        const response = await fetch(`${baseUrl}/public/items/${itemId}/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: 3, reason: "QR issue", performedBy: "Alice" }),
        });
        return response.status;
      }, { baseUrl: BASE_URL, itemId: bolts!.id });
      expect(issueStatus).toBe(404);

      await publicPage.getByTestId("qi-refresh").click();
      await expect(publicPage.locator(".qi-data-row--hero .qi-data-row__value")).toContainText(String(startingQuantity));
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

    await portInput.fill(String(LAN_PORT));
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
    await page.getByRole("tab", { name: "LAN Access" }).click();

    const lanToggle = page.getByRole("switch", { name: "Enabled" });
    await expect(lanToggle).toBeChecked();
    await page.locator(".lan-toggle-row .toggle-switch__track").click();

    await expect(lanToggle).not.toBeChecked({ timeout: 20_000 });
    await expect(page.getByTestId("lan-status")).toContainText("Stopped", { timeout: 20_000 });
  });
});
