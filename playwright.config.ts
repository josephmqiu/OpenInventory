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
  // Default worker count is controlled by the lane runner. The seed matrix uses
  // distinct LAN ports so the full suite can scale beyond one worker safely.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 2,
  reporter: [["html", { open: "never" }], ["list"], ["json", { outputFile: "test-results/e2e-report.json" }]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec/, use: { seedScenario: "empty" } },
    { name: "crud", testMatch: /inventory-crud\.spec/, use: { seedScenario: "empty" } },
    { name: "inventory-view", testMatch: /inventory-discovery\.spec/, use: { seedScenario: "inventory-basics" } },
    { name: "dashboard", testMatch: /dashboard\.spec/, use: { seedScenario: "audit-history" } },
    { name: "stock", testMatch: /stock-operations\.spec/, use: { seedScenario: "inventory-basics" } },
    { name: "audit", testMatch: /audit\.spec/, use: { seedScenario: "audit-history" } },
    { name: "lan", testMatch: /lan-access\.spec/, use: { seedScenario: "lan-access" } },
    {
      name: "lan-resilience",
      testMatch: /lan-resilience\.spec/,
      use: { seedScenario: "lan-warning" },
    },
    { name: "mobile", testMatch: /quick-issue-mobile\.spec/, use: { seedScenario: "lan-mobile" } },
    { name: "quick-issue-edges", testMatch: /quick-issue-no-personnel\.spec/, use: { seedScenario: "no-personnel-lan" } },
    { name: "settings", testMatch: /settings\.spec/, use: { seedScenario: "inventory-basics" } },
    { name: "backup", testMatch: /backup\.spec/, use: { seedScenario: "inventory-basics" } },
    {
      name: "backup-restore-handoff",
      testMatch: /backup-restore-handoff\.spec/,
      use: { seedScenario: "inventory-basics" },
    },
    { name: "backup-overdue", testMatch: /backup-overdue\.spec/, use: { seedScenario: "backup-overdue" } },
    { name: "backup-error", testMatch: /backup-error\.spec/, use: { seedScenario: "backup-error" } },
    { name: "qr-export", testMatch: /qr-export\.spec/, use: { seedScenario: "lan-qr" } },
    { name: "i18n", testMatch: /theme-and-language\.spec/, use: { seedScenario: "empty" } },
    { name: "shutdown", testMatch: /graceful-shutdown\.spec/, use: { seedScenario: "none" } },
    { name: "regression", testMatch: /regression\.spec/, use: { seedScenario: "inventory-basics" } },
  ],
});
