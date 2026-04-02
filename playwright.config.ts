import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    // Match the IPC round-trip timeout used in banner assertions.
    // Default 5s is too short on cold Electron processes (Windows CI).
    timeout: 10_000,
  },
  retries: 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec/, use: { seedScenario: "empty" } },
    { name: "crud", testMatch: /inventory-crud\.spec/, use: { seedScenario: "empty" } },
    { name: "stock", testMatch: /stock-operations\.spec/, use: { seedScenario: "inventory-basics" } },
    { name: "audit", testMatch: /audit\.spec/, use: { seedScenario: "audit-history" } },
    { name: "lan", testMatch: /lan-access\.spec/, use: { seedScenario: "lan-ready" } },
    { name: "mobile", testMatch: /quick-issue-mobile\.spec/, use: { seedScenario: "lan-ready" } },
    { name: "settings", testMatch: /settings\.spec/, use: { seedScenario: "inventory-basics" } },
    { name: "backup", testMatch: /backup\.spec/, use: { seedScenario: "inventory-basics" } },
    { name: "i18n", testMatch: /theme-and-language\.spec/, use: { seedScenario: "empty" } },
    { name: "shutdown", testMatch: /graceful-shutdown\.spec/, use: { seedScenario: "none" } },
  ],
});
