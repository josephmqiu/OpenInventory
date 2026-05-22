import { test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";

// Software Update tab (Settings → Update).
//
// E2E runs unpackaged Electron, so `is.dev` is true and the updater short-circuits
// to a deterministic "not-available" result (version "dev") — no real update server
// is contacted. That makes the up-to-date path testable; the downloaded/ready/chip
// states require a real release and are covered by unit tests instead.

test.describe.serial("software update", () => {
  test("Update tab shows the software update panel with version and check control", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Update" }).click();

    const panel = page.getByTestId("update-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator("h2")).toHaveText("Software Update");
    // First-run / up-to-date states both surface the version line.
    await expect(panel).toContainText("Version");
    await expect(page.getByRole("button", { name: "Check for updates" })).toBeVisible();
  });

  test("checking for updates reports up to date", async ({ page }) => {
    await navigateTo(page, "settings");
    await page.getByRole("tab", { name: "Update" }).click();

    await page.getByRole("button", { name: "Check for updates" }).click();

    await expect(page.getByTestId("update-panel")).toContainText("You're up to date");
    // No update is ready, so the ambient restart chip must not appear.
    await expect(page.getByTestId("update-chip")).toHaveCount(0);
  });
});
