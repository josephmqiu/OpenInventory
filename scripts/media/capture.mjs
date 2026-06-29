/**
 * README media capture for OpenInventory.
 *
 * Drives the browser-preview renderer (vite :5173 + dev API :4123) with
 * Playwright and produces full-resolution, non-squished stills + per-flow
 * WebM videos for the GitHub README.
 *
 *   node scripts/media/capture.mjs hero    # just the two hero stills
 *   node scripts/media/capture.mjs all     # hero stills + every flow video
 *   node scripts/media/capture.mjs <flow>  # a single flow (issue|batch|inventory|reports|mobile)
 *
 * Output: docs/media/raw/  (PNG stills + WebM videos). Encoding into GIF is
 * handled by scripts/media/encode.sh (ffmpeg palette pipeline, aspect-preserving).
 *
 * Capture method is the browser preview at a wide viewport: at >=1280px every
 * data-platform-specific CSS rule is inert, so the output is pixel-identical to
 * the Electron desktop renderer. Stills use deviceScaleFactor 2 (retina);
 * videos record from the 2x surface downscaled to the viewport size (supersampled
 * = crisp) and never change aspect ratio.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const MEDIA = path.join(ROOT, "docs/media"); // committed: stills + gifs
const RAW = path.join(MEDIA, "raw"); // gitignored: source webm (kept for a later MP4)
const VIDTMP = path.join(RAW, ".webm-tmp");
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(VIDTMP, { recursive: true });

const BASE = "http://localhost:5173";
const API = "http://localhost:4123";
const mode = process.argv[2] ?? "hero";

const DESKTOP = { width: 1440, height: 900, dsf: 2 };
const MOBILE = { width: 390, height: 844, dsf: 3 };

const log = (...a) => console.log("[capture]", ...a);
const pause = (page, ms) => page.waitForTimeout(ms);

/** Type into a locator slowly so the GIF shows the text being entered. */
async function typeSlow(locator, text, delay = 70) {
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(text, { delay });
}

async function settle(page, ms = 800) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function forceDesktopPlatform(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.platform = "desktop";
  });
}

async function snapshot() {
  return fetch(`${API}/api/snapshot`).then((r) => r.json());
}

// ── Desktop context factories ──────────────────────────────────────────────

async function desktopContext(browser, { record } = {}) {
  return browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    deviceScaleFactor: DESKTOP.dsf,
    colorScheme: "dark",
    ...(record
      ? { recordVideo: { dir: VIDTMP, size: { width: DESKTOP.width, height: DESKTOP.height } } }
      : {}),
  });
}

async function mobileContext(browser, { record } = {}) {
  return browser.newContext({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    deviceScaleFactor: MOBILE.dsf,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    ...(record
      ? { recordVideo: { dir: VIDTMP, size: { width: MOBILE.width, height: MOBILE.height } } }
      : {}),
  });
}

/** Open the desktop app, wait for the shell, land on a section. */
async function openDesktop(page, section = "dashboard") {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await forceDesktopPlatform(page);
  if (section !== "dashboard") {
    await page.getByTestId(`nav-${section}`).click();
    await page.waitForLoadState("domcontentloaded");
  }
  await settle(page);
}

async function finishVideo(page, ctx, name) {
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  const dest = path.join(RAW, `${name}.webm`);
  fs.renameSync(src, dest);
  log("saved", path.relative(ROOT, dest));
}

// ── Hero stills ─────────────────────────────────────────────────────────────

async function heroDesktop(browser) {
  const ctx = await desktopContext(browser);
  const page = await ctx.newPage();
  log("hero desktop → dashboard");
  await openDesktop(page, "dashboard");
  await page.waitForSelector(".metric-card", { timeout: 20000 }).catch(() => {});
  await settle(page, 700);
  await page.screenshot({ path: path.join(MEDIA, "hero-desktop.png") });
  await ctx.close();
}

async function heroMobile(browser) {
  const ctx = await mobileContext(browser);
  const page = await ctx.newPage();
  log("hero mobile → /issue.html catalog");
  await page.goto(`${BASE}/issue.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".qi-list-row", { timeout: 20000 }).catch(() => {});
  await settle(page, 1000);
  await page.screenshot({ path: path.join(MEDIA, "hero-mobile.png") });
  await ctx.close();
}

// ── Flow: issue material ─────────────────────────────────────────────────────

async function flowIssue(browser, snap) {
  const item = snap.items.find((i) => i.status === "in_stock" && i.currentQuantity >= 150);
  const qty = String(Math.min(50, Math.floor(item.currentQuantity / 4)));
  const ctx = await desktopContext(browser, { record: true });
  const page = await ctx.newPage();
  log(`flow issue → ${item.name} (${item.sku}) qty ${qty}`);
  await openDesktop(page, "inventory");
  await pause(page, 900);

  await page.getByTestId(`issue-btn-${item.sku}`).click();
  await page.waitForSelector(".action-panel", { timeout: 10000 });
  await page.waitForFunction(() => /Issue Material/.test(document.querySelector(".action-panel h2")?.textContent ?? ""));
  await pause(page, 700);

  const form = page.locator(".action-panel");
  await typeSlow(form.locator("label:has-text('Quantity') input"), qty);
  await pause(page, 400);
  await typeSlow(form.locator("label:has-text('Reason') input"), "Production line request");
  await pause(page, 400);
  await form.locator("label:has-text('Performed By') select").selectOption({ index: 1 });
  await pause(page, 800);

  await page.getByTestId("action-submit").click();
  await page.waitForSelector("[data-testid='feedback-banner']", { timeout: 10000 }).catch(() => {});
  await pause(page, 1600);
  await finishVideo(page, ctx, "flow-issue");
}

// ── Flow: batch issue ────────────────────────────────────────────────────────

async function flowBatch(browser, snap) {
  const picks = snap.items.filter((i) => i.status === "in_stock" && i.currentQuantity >= 60).slice(0, 3);
  const ctx = await desktopContext(browser, { record: true });
  const page = await ctx.newPage();
  log(`flow batch → ${picks.map((p) => p.name).join(", ")}`);
  await openDesktop(page, "inventory");
  await pause(page, 700);

  for (const p of picks) {
    // Match by SKU (unique, quote-free) — some item names contain `"` (inch marks).
    const row = page.locator("tbody tr", { has: page.getByText(p.sku, { exact: true }) }).first();
    await row.locator("input[type='checkbox']").check();
    await pause(page, 450);
  }
  await pause(page, 500);

  const batchBtn = page.getByRole("button", { name: "Batch Issue" });
  await batchBtn.click();
  const panel = page.locator(".batch-issue-panel");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  await panel.locator("tbody tr").first().waitFor({ timeout: 8000 });
  await pause(page, 700);

  const inputs = panel.locator(".batch-issue-input");
  const n = await inputs.count();
  const qtys = ["12", "8", "5"];
  for (let i = 0; i < n; i++) {
    await typeSlow(inputs.nth(i), qtys[i] ?? "5", 60);
    await pause(page, 350);
  }

  const sidebar = panel.locator(".batch-issue-sidebar");
  await sidebar.locator("select").selectOption({ index: 1 });
  await pause(page, 350);
  await sidebar.locator(".batch-issue-field").nth(1).locator("input").fill("Batch production order");
  await pause(page, 700);

  await page.getByTestId("batch-submit").click();
  await panel.locator(".feedback-banner").first().waitFor({ timeout: 10000 }).catch(() => {});
  await pause(page, 1600);
  await finishVideo(page, ctx, "flow-batch-issue");
}

// ── Flow: browse / search / filter ───────────────────────────────────────────

async function flowInventory(browser, snap) {
  const ctx = await desktopContext(browser, { record: true });
  const page = await ctx.newPage();
  log("flow inventory → search + filter + details");
  await openDesktop(page, "inventory");
  await pause(page, 900);

  const search = page.locator(".inventory-search");
  await typeSlow(search, "wire");
  await pause(page, 1400);
  await search.fill("");
  await pause(page, 800);

  await page.getByRole("button", { name: /Low Stock/i }).click();
  await pause(page, 1300);
  await page.getByRole("button", { name: /Out of Stock/i }).click();
  await pause(page, 1300);
  await page.getByRole("button", { name: /^All/i }).click();
  await pause(page, 900);

  // Sort by current quantity (ascending then descending) to show the sortable
  // columns. Scope here is browse/search/filter; we intentionally do NOT open
  // the item-details panel (the dev API doesn't render QR data URLs, so it would
  // show a "QR code unavailable" placeholder).
  const qtyHeader = page.locator("thead .th-sortable__button", { hasText: "Current Quantity" });
  await qtyHeader.click().catch(() => {}); // ascending
  await pause(page, 1500);
  await qtyHeader.click().catch(() => {}); // descending — highest stock on top
  await pause(page, 1800);
  await finishVideo(page, ctx, "flow-inventory");
}

// ── Flow: reports / period summary ───────────────────────────────────────────

async function flowReports(browser) {
  const ctx = await desktopContext(browser, { record: true });
  const page = await ctx.newPage();
  log("flow reports → period summary");
  await openDesktop(page, "reports");
  await page.getByRole("heading", { name: /Period Summary/ }).waitFor({ timeout: 15000 }).catch(() => {});
  await pause(page, 1300);

  // Switch to the year view: the full instrument band + trend + breakdowns.
  await page.getByTestId("report-granularity-year").click();
  await page.locator(".metrics-grid--instrument").waitFor({ timeout: 15000 }).catch(() => {});
  await pause(page, 1500);

  // Slow scroll down to reveal trend strip + top-items / by-personnel sections.
  for (const y of [350, 700, 1050, 1400]) {
    await page.evaluate((v) => window.scrollTo({ top: v, behavior: "smooth" }), y);
    await pause(page, 900);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(page, 1200);
  await finishVideo(page, ctx, "flow-reports");
}

// ── Flow: mobile QR lookup ───────────────────────────────────────────────────

async function flowMobile(browser) {
  const ctx = await mobileContext(browser, { record: true });
  const page = await ctx.newPage();
  log("flow mobile → catalog search + filter + detail");
  await page.goto(`${BASE}/issue.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".qi-list-row", { timeout: 20000 });
  await settle(page, 1000);

  await typeSlow(page.getByRole("searchbox"), "wire", 110);
  await pause(page, 1500);
  await page.getByRole("searchbox").fill("");
  await pause(page, 700);

  await page.locator(".qi-list__chip", { hasText: "Low Stock" }).click().catch(() => {});
  await pause(page, 1400);

  await page.locator(".qi-list-row").first().click();
  await page.locator(".qi-card").waitFor({ timeout: 8000 }).catch(() => {});
  await pause(page, 2000);

  await page.getByTestId("qi-view-all").click().catch(() => {});
  await pause(page, 1200);
  await finishVideo(page, ctx, "flow-mobile");
}

// ── Runner ───────────────────────────────────────────────────────────────────

const browser = await chromium.launch();
try {
  if (mode === "hero" || mode === "all") {
    await heroDesktop(browser);
    await heroMobile(browser);
  }
  if (mode === "all" || mode === "issue" || mode === "batch" || mode === "inventory" || mode === "reports" || mode === "mobile") {
    const snap = await snapshot();
    if (mode === "all" || mode === "issue") await flowIssue(browser, snap);
    if (mode === "all" || mode === "batch") await flowBatch(browser, snap);
    if (mode === "all" || mode === "inventory") await flowInventory(browser, snap);
    if (mode === "all" || mode === "reports") await flowReports(browser);
    if (mode === "all" || mode === "mobile") await flowMobile(browser);
  }
} finally {
  await browser.close();
}
fs.rmSync(VIDTMP, { recursive: true, force: true });
log("done →", path.relative(ROOT, MEDIA));
