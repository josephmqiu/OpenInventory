import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type LaneName = "full" | "smoke" | "parallel-safe";

const lane = (process.argv[2] as LaneName | undefined) ?? "full";
const build = process.argv.includes("--build");

// Worker count is auto-derived rather than hard-coded per lane.
//
// Local dev (often 8+ cores): scale to min(cpus-1, 4) so a fast machine gets
// real parallelism without starving the OS. Floor of 2 keeps slow/2-core boxes
// running more than one Electron at a time.
//
// CI (windows-latest, the only production target, ~4 vCPU): default to 3. Each
// worker is a full Electron instance, and on Windows the boot concurrency plus
// SQLite/userData file locking can make 4 workers SLOWER and flakier, not
// faster. The bump to 4 is gated on a Windows A/B (run the changed lanes 3x at
// PW_WORKERS=3 and 4; adopt 4 only if faster AND 0-flaky across all three).
//
// `PW_WORKERS` always overrides, which is what the A/B uses.
function autoWorkers(): number {
  if (process.env.CI) return 3;
  const cpus = os.cpus()?.length ?? 2;
  return Math.max(2, Math.min(cpus - 1, 4));
}

const laneProjects: Record<LaneName, { projects: string[] | null; workers: number }> = {
  full: {
    projects: null,
    workers: autoWorkers(),
  },
  smoke: {
    projects: [
      "smoke",
      "crud",
      "inventory-view",
      "stock",
    ],
    // Smoke stays intentionally small and serial-light for fast local
    // confidence; 2 workers is plenty for a 4-project lane.
    workers: 2,
  },
  "parallel-safe": {
    projects: [
      "smoke",
      "inventory-view",
      "dashboard",
      "audit",
      "lan",
      "lan-resilience",
      "mobile",
      "quick-issue-edges",
      "backup-overdue",
      "backup-error",
      "qr-export",
      "i18n",
      "shutdown",
      "update",
    ],
    workers: autoWorkers(),
  },
};

if (!(lane in laneProjects)) {
  console.error(`Unknown E2E lane: ${lane}`);
  process.exit(1);
}

function runCommand(command: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      env,
    });

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const config = laneProjects[lane];
  const projectArgs = config.projects?.map((project) => `--project=${project}`).join(" ") ?? "";
  const reportPath = path.resolve(process.cwd(), "test-results/e2e-report.json");
  fs.rmSync(reportPath, { force: true });

  const innerCommand = [
    build ? "electron-vite build" : null,
    "npx tsx e2e/scripts/generate-seeds.ts",
    "npx tsx scripts/prepare-e2e.ts",
    `npx playwright test${projectArgs ? ` ${projectArgs}` : ""}`,
  ].filter(Boolean).join(" && ");

  const wrappedCommand = `npx tsx scripts/run-with-node-native-restore.ts "${innerCommand}"`;
  const env = {
    ...process.env,
    PW_WORKERS: process.env.PW_WORKERS ?? String(config.workers),
    PW_FAIL_ON_FLAKY: process.env.PW_FAIL_ON_FLAKY ?? "1",
  };

  const exitCode = await runCommand(wrappedCommand, env);

  if (fs.existsSync(reportPath)) {
    await runCommand(`npx tsx scripts/report-e2e-results.ts "${reportPath}"`, process.env);
  }

  process.exit(exitCode);
}

void main();
