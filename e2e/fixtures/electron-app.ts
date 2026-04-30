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
const APP_READY_TIMEOUT_MS = 60_000;

function createUserDataDir(seedScenario: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-e2e-"));

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

  return tempDir;
}

async function cleanupUserDataDir(tempDir: string): Promise<void> {
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
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function launchElectronApp(
  tempDir: string,
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  const appRoot = path.join(__dirname, "../..");
  const electronApp = await electron.launch({
    args: [appRoot, `--user-data-dir=${tempDir}`],
    env: { ...process.env, ...extraEnv, ELECTRON_ENABLE_LOGGING: "1" },
  });

  electronApp.process().stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (msg.trim()) console.error("[electron stderr]", msg);
  });

  return electronApp;
}

async function getDesktopPage(electronApp: ElectronApplication): Promise<Page> {
  const windows = electronApp.windows();
  const page = windows.length > 0
    ? windows[0]
    : await electronApp.firstWindow({ timeout: APP_READY_TIMEOUT_MS });
  await page.waitForSelector(".sidebar", { timeout: APP_READY_TIMEOUT_MS });
  return page;
}

// Extend Playwright's use options to include our seedScenario
declare module "@playwright/test" {
  interface TestOptions {
    seedScenario: string;
    electronEnv: Record<string, string>;
  }
}

// Worker-scoped: one Electron app per Playwright project.
// Each project gets a fresh temp dir with a pre-seeded database.
export const test = base.extend<
  { page: Page; browserPage: Page; app: ElectronApplication; userDataDir: string },
  {
    electronApp: ElectronApplication;
    sharedPage: Page;
    seedScenario: string;
    electronEnv: Record<string, string>;
    userDataDir: string;
  }
>({
  seedScenario: ["empty", { scope: "worker", option: true }],
  electronEnv: [{}, { scope: "worker", option: true }],

  userDataDir: [async ({ seedScenario }, use) => {
    const tempDir = createUserDataDir(seedScenario);
    await use(tempDir);
  }, { scope: "worker" }],

  electronApp: [async ({ userDataDir, electronEnv }, use) => {
    const tempDir = userDataDir;
    const electronApp = await launchElectronApp(tempDir, electronEnv);

    await use(electronApp);
    await electronApp.close();
    await cleanupUserDataDir(tempDir);
  }, { scope: "worker" }],

  sharedPage: [async ({ electronApp }, use) => {
    const page = await getDesktopPage(electronApp);
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

  app: async ({ electronApp }, use) => {
    await use(electronApp);
  },
});

export const isolatedTest = base.extend<
  { page: Page; browserPage: Page; app: ElectronApplication; userDataDir: string },
  {
    electronApp: ElectronApplication;
    seedScenario: string;
    electronEnv: Record<string, string>;
    userDataDir: string;
  }
>({
  seedScenario: ["empty", { option: true }],
  electronEnv: [{}, { option: true }],

  userDataDir: async ({ seedScenario }, use) => {
    const tempDir = createUserDataDir(seedScenario);
    await use(tempDir);
    await cleanupUserDataDir(tempDir);
  },

  electronApp: async ({ userDataDir, electronEnv }, use) => {
    const electronApp = await launchElectronApp(userDataDir, electronEnv);
    await use(electronApp);
    await electronApp.close();
  },

  page: async ({ electronApp }, use) => {
    const page = await getDesktopPage(electronApp);
    await use(page);
  },

  browserPage: async ({ browser }, use) => {
    const browserInstance = browser as Browser;
    const page = await browserInstance.newPage();
    await use(page);
    await page.close();
  },

  app: async ({ electronApp }, use) => {
    await use(electronApp);
  },
});

export { expect } from "@playwright/test";
