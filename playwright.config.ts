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
});
