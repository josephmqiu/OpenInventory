import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Worker-scoped: one Electron app shared across all serial tests
export const test = base.extend<
  { page: Page },
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
    fs.rmSync(tempDir, { recursive: true, force: true });
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
});

export { expect } from "@playwright/test";
