import {
  test as base,
  _electron as electron,
  type Browser,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Worker-scoped: one Electron app shared across all serial tests in a worker.
// Serial test suites (theme-and-language, lan-access, inventory-workflow) build
// on shared state, so each test must NOT get a fresh app instance.
export const test = base.extend<
  { page: Page; browserPage: Page },
  { electronApp: ElectronApplication; sharedPage: Page }
>({
  electronApp: [async ({}, use) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-"));

    const appRoot = path.join(__dirname, "../..");
    const electronApp = await electron.launch({
      args: [appRoot, `--user-data-dir=${tempDir}`],
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    });

    electronApp.process().stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.trim()) console.error("[electron stderr]", msg);
    });

    await use(electronApp);
    await electronApp.close();

    // On Windows, SQLite file handles may not release immediately.
    // Retry with back-off to avoid EBUSY in CI.
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch {
        if (i === 4) {
          console.warn(`[e2e] Could not clean temp dir after 5 retries: ${tempDir}`);
          break;
        }
        const delay = 100 * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }, { scope: "worker" }],

  sharedPage: [async ({ electronApp }, use) => {
    const windows = electronApp.windows();
    const page = windows.length > 0
      ? windows[0]
      : await electronApp.firstWindow({ timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".sidebar", { timeout: 30_000 });
    await use(page);
  }, { scope: "worker" }],

  // Test-scoped alias so tests receive `page`
  page: async ({ sharedPage }, use) => {
    await use(sharedPage);
  },

  browserPage: async ({ browser }, use) => {
    const browserInstance = browser as Browser;
    const page = await browserInstance.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from "@playwright/test";
