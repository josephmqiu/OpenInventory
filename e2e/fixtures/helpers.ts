import { expect, type Page } from "@playwright/test";

/**
 * Dismiss the WelcomeScreen modal if it appears (empty database / first launch).
 * Clicks "Start Fresh" to proceed. No-op if the modal isn't visible.
 */
export async function dismissWelcomeScreen(page: Page): Promise<void> {
  const startFresh = page.locator(".welcome-dialog__btn", { hasText: "Start Fresh" });
  await startFresh.click({ timeout: 3_000 }).catch(() => {});
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

/**
 * Navigate to a section using the sidebar nav data-testid.
 * Section names match the camelCase keys used in App.tsx navOrder:
 * dashboard, inventory, itemManagement, alerts, audit, personnel, settings
 */
export async function navigateTo(page: Page, section: string): Promise<void> {
  await page.getByTestId(`nav-${section}`).click();
  await page.waitForLoadState("domcontentloaded");
}
