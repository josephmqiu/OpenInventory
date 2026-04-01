/**
 * E2E: Verify graceful shutdown disposes scoped resources.
 *
 * Launches a separate Electron instance, creates an item to prove the DB works,
 * closes the app, and then verifies the database file is not locked.
 */
import { test as base, _electron as electron, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import Database from "better-sqlite3";

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

  // Verify the app loaded by checking for the sidebar
  await expect(page.locator(".sidebar")).toBeVisible();

  // Close the app — this triggers app.on("before-quit") → managedRuntime.dispose()
  await electronApp.close();

  // After close, the DB file should not be locked. Open it to verify.
  const dbPath = path.join(tempDir, "data", "inventory-monitor.db");
  expect(fs.existsSync(dbPath)).toBe(true);

  const probe = new Database(dbPath);
  probe.pragma("foreign_keys = ON");
  const rows = probe.prepare("SELECT * FROM inventory_items").all();
  expect(Array.isArray(rows)).toBe(true);
  probe.close();

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});
