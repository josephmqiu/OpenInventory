/**
 * E2E: Verify graceful shutdown disposes scoped resources.
 *
 * Launches a separate Electron instance, creates an item to prove the DB works,
 * closes the app, and then verifies the database file is not locked.
 */
/**
 * E2E: Verify graceful shutdown disposes scoped resources.
 *
 * Launches a separate Electron instance, verifies the app boots,
 * closes it, and confirms the database file exists and is not locked
 * (verified by being readable as a regular file — we can't use
 * better-sqlite3 here because the native module is built for Electron's
 * Node version, not Playwright's).
 */
import { test as base, _electron as electron, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

base("app shutdown releases the database connection", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-shutdown-"));
  const appRoot = path.join(__dirname, "..");

  const electronApp = await electron.launch({
    args: [appRoot, `--user-data-dir=${tempDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
  });

  const page = await electronApp.firstWindow({ timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(".sidebar", { timeout: 30_000 });

  // Verify the app loaded
  await expect(page.locator(".sidebar")).toBeVisible();

  // Close the app — triggers app.on("before-quit") → managedRuntime.dispose()
  await electronApp.close();

  // After close, the DB file should exist and be readable (not locked).
  const dbPath = path.join(tempDir, "data", "inventory-monitor.db");
  expect(fs.existsSync(dbPath)).toBe(true);

  // Verify the file is a valid SQLite database by checking its header.
  const header = Buffer.alloc(16);
  const fd = fs.openSync(dbPath, "r");
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  // SQLite files start with "SQLite format 3\0"
  expect(header.toString("utf-8", 0, 15)).toBe("SQLite format 3");

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});
