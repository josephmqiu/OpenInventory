import { test, expect } from "./fixtures/electron-app";
import { dismissWelcomeScreen, navigateTo } from "./fixtures/helpers";
import fs from "fs";
import os from "os";
import path from "path";

const topbarTitle = (page: import("@playwright/test").Page) =>
  page.locator(".topbar h2");

test.describe.serial("smoke tests (empty seed)", () => {
  test("welcome screen restore path opens comparison dialog before restoring", async ({ page }) => {
    const restoreSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "oi-smoke-restore-"));
    fs.copyFileSync(
      path.join(process.cwd(), "e2e", ".seed-cache", "inventory-basics.db"),
      path.join(restoreSourceDir, "database.db"),
    );

    await page.evaluate(async (selectedPath) => {
      const originalInvoke = window.electronAPI.invoke.bind(window.electronAPI);
      let restoreCalls = 0;

      Object.defineProperty(window, "__restoreTest", {
        configurable: true,
        value: {
          getRestoreCalls: () => restoreCalls,
        },
      });

      window.electronAPI.invoke = async (channel: string, args?: unknown) => {
        if (channel === "select-restore-source") {
          return selectedPath;
        }
        if (channel === "restore-from-backup") {
          restoreCalls += 1;
          return null;
        }
        return originalInvoke(channel, args);
      };
    }, restoreSourceDir);

    await page.locator(".welcome-dialog__btn", { hasText: "Restore from Backup" }).click();
    await expect(page.getByTestId("restore-dialog")).toBeVisible();
    await page.getByTestId("restore-dialog-cancel").click();
    await expect(page.getByTestId("restore-dialog")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).__restoreTest.getRestoreCalls())).toBe(0);

    await page.locator(".welcome-dialog__btn", { hasText: "Start Fresh" }).click();
    fs.rmSync(restoreSourceDir, { recursive: true, force: true });
  });

  test("all 7 sidebar nav sections render", async ({ page }) => {
    await dismissWelcomeScreen(page);
    const sections: Array<{ id: string; title: string }> = [
      { id: "dashboard", title: "Dashboard" },
      { id: "inventory", title: "Inventory" },
      { id: "itemManagement", title: "Item Management" },
      { id: "alerts", title: "Alerts" },
      { id: "audit", title: "Audit" },
      { id: "personnel", title: "Personnel" },
      { id: "settings", title: "Settings" },
    ];

    for (const section of sections) {
      await page.getByTestId(`nav-${section.id}`).click();
      await expect(topbarTitle(page)).toHaveText(section.title, { timeout: 5_000 });
    }
  });

  test("empty inventory table shows no-data state", async ({ page }) => {
    await dismissWelcomeScreen(page);
    await navigateTo(page, "inventory");
    await expect(topbarTitle(page)).toHaveText("Inventory");

    // Table should exist but have zero body rows, or an empty state message is shown
    const table = page.locator("table");
    const emptyState = page.locator(".empty-state, .no-data, [class*='empty']");
    const bodyRows = table.locator("tbody tr");

    const hasTable = await table.count();
    if (hasTable > 0) {
      await expect(bodyRows).toHaveCount(0);
    } else {
      await expect(emptyState.first()).toBeVisible();
    }
  });

  test("empty personnel section shows no cards", async ({ page }) => {
    await dismissWelcomeScreen(page);
    await navigateTo(page, "personnel");
    await expect(topbarTitle(page)).toHaveText("Personnel");

    await expect(page.locator(".personnel-card")).toHaveCount(0);
  });

  test("empty alerts section shows no alert cards", async ({ page }) => {
    await dismissWelcomeScreen(page);
    await navigateTo(page, "alerts");
    await expect(topbarTitle(page)).toHaveText("Alerts");

    await expect(page.locator(".alert-card")).toHaveCount(0);
  });

  test("no quick-issue CSS classes in desktop DOM", async ({ page }) => {
    await dismissWelcomeScreen(page);
    await navigateTo(page, "dashboard");
    await expect(topbarTitle(page)).toHaveText("Dashboard");

    // No elements with quick-issue or qi- CSS classes
    const quickIssueElements = await page
      .locator("[class*='quick-issue'], [class*='qi-']")
      .count();
    expect(quickIssueElements).toBe(0);

    // Page content should not contain these component references
    const html = await page.content();
    expect(html).not.toContain("quick-issue-panel");
    expect(html).not.toContain("QuickIssuePage");
  });
});
