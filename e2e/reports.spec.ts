import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";
import { installRendererDownloadCapture, readCapturedRendererDownload } from "./fixtures/downloads";

// The `audit-history` seed spreads 55 movements across the *last 30 days
// relative to now*, so the panel's default "last completed month" view can be
// legitimately empty on month-end run dates. The deterministic anchor is the
// CURRENT calendar year: movement i=0 is always stamped at `now`, so the
// current year always contains data regardless of the wall-clock run date.
const CURRENT_YEAR = new Date().getFullYear();

/** Switch to the Year granularity and select a specific calendar year. */
async function selectYear(page: import("@playwright/test").Page, year: number): Promise<void> {
  await page.getByTestId("report-granularity-year").click();
  await expect(page.getByTestId("report-granularity-year")).toHaveClass(/filter-tab--active/);
  // In year granularity only the year <select> renders (the index select is hidden).
  await page.locator(".report-period-select").selectOption(String(year));
  await expect(page.locator(".report-identity__title")).toContainText(String(year), { timeout: 15_000 });
}

test.describe("reports / period summary", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "reports");
  });

  test("mounts the period summary with identity, controls, print, and CSV", async ({ page }) => {
    // Identity block (also the print header) renders.
    await expect(page.getByRole("heading", { name: /Period Summary/ })).toBeVisible({ timeout: 15_000 });
    // "At current prices" caveat is always present (honest valuation label).
    await expect(page.locator(".report-identity__caveat")).toBeVisible();

    // Granularity segmented control — all four periods.
    await expect(page.getByTestId("report-granularity-month")).toBeVisible();
    await expect(page.getByTestId("report-granularity-quarter")).toBeVisible();
    await expect(page.getByTestId("report-granularity-half")).toBeVisible();
    await expect(page.getByTestId("report-granularity-year")).toBeVisible();
    await expect(page.getByTestId("report-granularity-month")).toHaveClass(/filter-tab--active/);

    // Export + print actions.
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });

  test("switching granularity loads a report (KPI band or empty state, no crash)", async ({ page }) => {
    await page.getByTestId("report-granularity-half").click();
    await expect(page.getByTestId("report-granularity-half")).toHaveClass(/filter-tab--active/);

    // The IPC -> getAuditReport path resolved: either the instrument band rendered
    // (data in period) or the explicit empty-period message — never a blank/crash.
    const bandOrEmpty = page.locator(".metrics-grid--instrument, .report-empty");
    await expect(bandOrEmpty.first()).toBeVisible({ timeout: 15_000 });
  });

  test("current-year view renders the full instrument band, trend, and breakdowns", async ({ page }) => {
    await selectYear(page, CURRENT_YEAR);

    // Instrument band (the hero) with all four value/health KPIs.
    const band = page.locator(".metrics-grid--instrument");
    await expect(band).toBeVisible({ timeout: 15_000 });
    await expect(band.locator(".metric-card__label", { hasText: "Value Issued" })).toBeVisible();
    await expect(band.locator(".metric-card__label", { hasText: "Value Received" })).toBeVisible();
    await expect(band.locator(".metric-card__label", { hasText: "Net Value" })).toBeVisible();
    await expect(band.locator(".metric-card__label", { hasText: "Items Hit Low/Zero" })).toBeVisible();

    // Trend strip (last 6 periods) renders bars.
    await expect(page.locator(".trend-strip")).toBeVisible();
    await expect(page.locator(".trend-bar").first()).toBeVisible();

    // Top-items breakdown contains a seeded item, by-personnel contains seeded staff.
    const topItems = page.locator(".report-section", { hasText: "Top items by issued value" });
    await expect(topItems.locator("tbody tr", { hasText: "Bolts M6" }).first()).toBeVisible();
    const byPersonnel = page.locator(".report-section", { hasText: "By Personnel" });
    await expect(byPersonnel.locator("tbody tr", { hasText: "Alice" }).first()).toBeVisible();
    await expect(byPersonnel.locator("tbody tr", { hasText: "Bob" }).first()).toBeVisible();
  });

  test("print media uses the full page width (not the narrow content column)", async ({ page }) => {
    // Regression: the @media print block hid the sidebar but didn't collapse the
    // `grid 180px 1fr` shell, so the report printed in a ~180px strip and clipped.
    await selectYear(page, CURRENT_YEAR);
    await expect(page.locator(".metrics-grid--instrument")).toBeVisible({ timeout: 15_000 });
    await page.emulateMedia({ media: "print" });
    const panelW = await page.locator(".report-panel").evaluate((el) => el.getBoundingClientRect().width);
    const bodyW = await page.evaluate(() => document.body.getBoundingClientRect().width);
    expect(panelW).toBeGreaterThan(bodyW * 0.8);
    await page.emulateMedia({ media: "screen" });
  });

  test("unpriced items surface a first-class valuation warning", async ({ page }) => {
    // The audit-history seed has no item prices, so a current-year report must
    // warn that value excludes the unpriced items rather than silently showing 0.
    await selectYear(page, CURRENT_YEAR);
    await expect(page.locator(".report-identity__warning")).toContainText(/unpriced items/, { timeout: 15_000 });
  });

  test("top-item drill-down shows the balance sheet and returns to the report", async ({ page }) => {
    await selectYear(page, CURRENT_YEAR);

    const itemRow = page
      .locator(".report-section", { hasText: "Top items by issued value" })
      .locator("tbody tr.data-table__row--clickable")
      .first();
    await expect(itemRow).toBeVisible({ timeout: 15_000 });
    await itemRow.click();

    // Reuses the shared AuditDrillDown component (same DOM as the Activity tab).
    await expect(page.getByRole("button", { name: "Back To List" })).toBeVisible();
    await expect(page.locator("table thead th:has-text('Balance')")).toBeVisible();

    await page.getByRole("button", { name: "Back To List" }).click();
    await expect(page.locator(".metrics-grid--instrument")).toBeVisible();
  });

  test("CSV export downloads a multi-section period summary", async ({ page }) => {
    await installRendererDownloadCapture(page);
    await selectYear(page, CURRENT_YEAR);

    const exportBtn = page.getByRole("button", { name: "Export CSV" });
    await expect(exportBtn).toBeEnabled();
    await exportBtn.click();
    await expect.poll(() => readCapturedRendererDownload(page)).not.toBeNull();

    const capture = await readCapturedRendererDownload(page);
    expect(capture?.download).toMatch(new RegExp(`^period-summary-${CURRENT_YEAR}-year-\\d+\\.csv$`));
    // Identity header + the section blocks + a seeded item must be present.
    expect(capture?.text).toContain("Period Summary");
    expect(capture?.text).toContain("Top items by issued value");
    expect(capture?.text).toContain("Bolts M6");
    expect(capture?.text).toContain("Alice");
  });

  test("a year with no movements shows the empty state and disables CSV export", async ({ page }) => {
    // Three years back is always empty (all seeded movements fall in the
    // current year's 30-day window), independent of the run date.
    await selectYear(page, CURRENT_YEAR - 3);

    await expect(page.locator(".report-empty")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  test("period navigation arrows and index select change the active period", async ({ page }) => {
    // Default month view — the identity title reflects the selected period.
    const title = page.locator(".report-identity__title");
    await expect(title).toBeVisible({ timeout: 15_000 });
    const initial = (await title.textContent())?.trim();
    expect(initial).toBeTruthy();

    // Stepping back a period changes the label (period math is wired to controls).
    await page.getByRole("button", { name: "Previous period" }).click();
    await expect(async () => {
      expect((await title.textContent())?.trim()).not.toEqual(initial);
    }).toPass();

    // The month index select is present and also re-targets the period.
    // Compare two always-distinct months so the assertion never depends on
    // which month the prev-step happened to land on.
    const indexSelect = page.getByTestId("report-index-select");
    await expect(indexSelect).toBeVisible();
    await indexSelect.selectOption("1"); // January
    const janTitle = (await title.textContent())?.trim();
    await indexSelect.selectOption("12"); // December
    await expect(async () => {
      expect((await title.textContent())?.trim()).not.toEqual(janTitle);
    }).toPass();
  });
});
