import { test, expect } from "./fixtures/electron-app";
import { navigateTo, expectSuccess, dismissBanner } from "./fixtures/helpers";
import fs from "fs";
import os from "os";
import path from "path";

let backupDir = "";

// inventory-basics seed: 3 items, 2 personnel (Alice, Bob)

test.describe.serial("backup and restore", () => {
  test.afterAll(() => {
    if (backupDir) {
      fs.rmSync(backupDir, { force: true, recursive: true });
    }
  });

  test("shows status-first layout with not-configured banner", async ({ page }) => {
    await navigateTo(page, "settings");
    const backupPanel = page.locator(".panel").filter({ has: page.locator("h2:has-text('Backup Plan')") });

    // Status pill should show "Needs attention" (not configured)
    await expect(backupPanel.locator(".status-pill")).toContainText(/needs attention/i, { timeout: 10_000 });

    // Warning banner visible
    await expect(backupPanel.locator(".panel-banner")).toBeVisible();

    // Backup Now should be disabled (no target path)
    await expect(page.getByTestId("backup-now")).toBeDisabled();
  });

  test("configures backup with schedule and saves", async ({ page }) => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-backup-"));

    await navigateTo(page, "settings");
    const backupPanel = page.locator(".panel").filter({ has: page.locator("h2:has-text('Backup Plan')") });

    // In real use, Browse button opens a native dialog. In E2E, we type the path directly.
    await backupPanel.locator(".backup-path-input").fill(backupDir);

    // Set schedule: Every 8 hours
    const scheduleNumber = backupPanel.locator(".backup-schedule-number");
    await scheduleNumber.fill("8");

    // Check "Also back up on startup"
    const startupCheckbox = backupPanel.locator(".backup-startup-check input[type='checkbox']");
    await startupCheckbox.check();

    await page.getByTestId("backup-save").click();

    await expect(page.getByTestId("feedback-banner")).toContainText("Backup settings updated.", {
      timeout: 10_000,
    });
  });

  test("backup now creates directory with manifest and database", async ({ page }) => {
    await dismissBanner(page);

    // Wait for Backup Now to become enabled (save from prior test updated the snapshot)
    await expect(page.getByTestId("backup-now")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("backup-now").click();

    await expect(page.getByTestId("feedback-banner")).toContainText("Backup completed.", {
      timeout: 15_000,
    });

    // Verify backup directory structure
    const backupSubDir = path.join(backupDir, "OpenInventory-Backup");
    await expect.poll(() => fs.existsSync(backupSubDir)).toBe(true);

    // database.db exists
    const dbFile = path.join(backupSubDir, "database.db");
    await expect.poll(() => fs.existsSync(dbFile)).toBe(true);
    expect(fs.statSync(dbFile).size).toBeGreaterThan(0);

    // manifest.json exists with correct structure
    const manifestFile = path.join(backupSubDir, "manifest.json");
    await expect.poll(() => fs.existsSync(manifestFile)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.platform).toBe(process.platform);
    expect(manifest.stats.items).toBe(3); // inventory-basics seed has 3 items
    expect(manifest.stats.personnel).toBe(2); // Alice + Bob
    expect(manifest.createdAt).toBeTruthy();
  });

  test("status strip shows last backup info after successful backup", async ({ page }) => {
    await dismissBanner(page);
    await navigateTo(page, "settings");

    const statusStrip = page.locator(".backup-status-strip");
    await expect(statusStrip).toBeVisible({ timeout: 10_000 });

    // Should show file size and "verified"
    await expect(statusStrip).toContainText(/verified/);
  });

  test("second backup overwrites the same file (not timestamped)", async ({ page }) => {
    await dismissBanner(page);

    // Get file modification time of current backup
    const dbFile = path.join(backupDir, "OpenInventory-Backup", "database.db");
    const mtimeBefore = fs.statSync(dbFile).mtimeMs;

    // Small delay to ensure mtime changes
    await page.waitForTimeout(1100);

    await page.getByTestId("backup-now").click();
    await expect(page.getByTestId("feedback-banner")).toContainText("Backup completed.", {
      timeout: 15_000,
    });

    // Same file, different mtime
    const mtimeAfter = fs.statSync(dbFile).mtimeMs;
    expect(mtimeAfter).toBeGreaterThan(mtimeBefore);

    // Still only one database.db (no timestamped copies)
    const files = fs.readdirSync(path.join(backupDir, "OpenInventory-Backup"));
    const dbFiles = files.filter((f) => f.endsWith(".db"));
    expect(dbFiles).toEqual(["database.db"]);
  });
});
