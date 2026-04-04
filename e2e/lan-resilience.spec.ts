import { isolatedTest as test, expect } from "./fixtures/electron-app";
import { navigateTo } from "./fixtures/helpers";
import http from "node:http";

const CONFLICT_PORT = 19883;

test.describe.serial("LAN resilience", () => {
  test("saving an occupied port moves LAN into the error state with actionable status text", async ({ page }) => {
    const blocker = await new Promise<http.Server>((resolve, reject) => {
      const server = http.createServer((_, response) => {
        response.statusCode = 200;
        response.end("occupied");
      });
      server.once("error", reject);
      server.listen(CONFLICT_PORT, () => resolve(server));
    });

    try {
      await navigateTo(page, "settings");
      await page.getByRole("tab", { name: "LAN Access" }).click();

      const lanPanel = page.locator(".panel:has-text('LAN Access')");
      await expect(lanPanel).toBeVisible({ timeout: 10_000 });

      const portInput = lanPanel.locator("input[type='number']");
      await portInput.fill(String(CONFLICT_PORT));
      await page.getByTestId("lan-save").click();

      await expect(page.getByTestId("lan-status")).toContainText("Error", { timeout: 20_000 });
      await expect(lanPanel.locator(".backup-grid")).toContainText(/LAN server error/i);
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
