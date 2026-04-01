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

const SEED_CACHE = path.join(__dirname, "../.seed-cache");

// Extend Playwright's use options to include our seedScenario
declare module "@playwright/test" {
  interface TestOptions {
    seedScenario: string;
  }
}

// Worker-scoped: one Electron app per Playwright project.
// Each project gets a fresh temp dir with a pre-seeded database.
export const test = base.extend<
  { page: Page; browserPage: Page },
  { electronApp: ElectronApplication; sharedPage: Page; seedScenario: string }
>({
  seedScenario: ["empty", { scope: "worker", option: true }],

  electronApp: [async ({ seedScenario }, use) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-"));

    // Copy pre-built seed database if scenario is not "none"
    if (seedScenario !== "none") {
      const seedDb = path.join(SEED_CACHE, `${seedScenario}.db`);
      if (!fs.existsSync(seedDb)) {
        throw new Error(
          `Seed database not found: ${seedDb}. Run 'npx tsx e2e/scripts/generate-seeds.ts' first.`,
        );
      }
      const dataDir = path.join(tempDir, "data");
      fs.mkdirSync(dataDir, { recursive: true });
      fs.copyFileSync(seedDb, path.join(dataDir, "inventory-monitor.db"));
    }

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
