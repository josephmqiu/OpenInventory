import { expect, type Locator, type Page } from "@playwright/test";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dismiss the top-level feedback banner if visible.
 * Uses auto-wait with a short timeout + catch to avoid race conditions.
 * Banners require explicit dismiss (no auto-timeout).
 */
export async function dismissBanner(page: Page): Promise<void> {
  const btn = page.getByTestId("feedback-dismiss");
  await btn.click({ timeout: 2_000 }).catch(() => {});
}

/**
 * Wait for a non-error feedback banner to appear.
 * Both success and error banners share data-testid="feedback-banner",
 * so we exclude the error variant to avoid false positives.
 */
export async function waitForBanner(page: Page): Promise<void> {
  await expect(
    page.locator("[data-testid='feedback-banner']:not(.feedback-banner--error)"),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Wait for a success/notice banner and dismiss it.
 * For top-level feedback banner only. BatchIssuePanel, LanAccessPanel,
 * and QuickIssueMobile use inline feedback — assert those directly.
 */
export async function expectSuccess(page: Page): Promise<void> {
  await waitForBanner(page);
  await dismissBanner(page);
}

export async function expectError(
  page: Page,
  expectedText?: string | RegExp,
): Promise<void> {
  const banner = page.locator("[data-testid='feedback-banner'].feedback-banner--error");
  await expect(banner).toBeVisible({ timeout: 10_000 });
  if (expectedText) {
    await expect(banner).toContainText(expectedText);
  }
}

/**
 * Navigate to a section using the sidebar nav data-testid.
 * Section names match the camelCase keys used in App.tsx navOrder:
 * dashboard, inventory, activity, settings
 */
export async function navigateTo(page: Page, section: string): Promise<void> {
  await page.getByTestId(`nav-${section}`).click();
  await page.waitForLoadState("domcontentloaded");
}

export function inventoryRow(page: Page, itemName: string): Locator {
  return page.locator("tbody tr", {
    has: page.locator(".cell-title, td").filter({
      hasText: new RegExp(`^${escapeRegExp(itemName)}$`),
    }),
  });
}

export async function connectLanBrowser(page: Page, accessKey: string): Promise<void> {
  await expect(page.locator(".auth-card")).toBeVisible({ timeout: 10_000 });
  await page.locator(".auth-card__field input").fill(accessKey);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.locator(".sidebar")).toBeVisible({ timeout: 10_000 });
}
