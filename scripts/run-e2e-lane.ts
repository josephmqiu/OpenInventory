import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type LaneName = "full" | "smoke" | "parallel-safe";

const lane = (process.argv[2] as LaneName | undefined) ?? "full";
const build = process.argv.includes("--build");

const laneProjects: Record<LaneName, { projects: string[] | null; workers: number }> = {
  full: {
    projects: null,
    workers: 2,
  },
  smoke: {
    projects: [
      "smoke",
      "crud",
      "inventory-view",
      "stock",
    ],
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
    ],
    workers: 3,
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
