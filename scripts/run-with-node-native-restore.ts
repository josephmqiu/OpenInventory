import { spawn } from "node:child_process";

const command = process.argv.slice(2).join(" ").trim();

if (!command) {
  console.error("Expected a command to run.");
  process.exit(1);
}

function runCommand(commandToRun: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(commandToRun, {
      shell: true,
      stdio: "inherit",
    });

    let forwardedSignal: NodeJS.Signals | null = null;

    const forwardSignal = (signal: NodeJS.Signals) => {
      forwardedSignal = signal;
      child.kill(signal);
    };

    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);

    child.on("error", (error) => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);

      if (signal) {
        resolve(signal === "SIGINT" ? 130 : 143);
        return;
      }

      if (forwardedSignal) {
        resolve(forwardedSignal === "SIGINT" ? 130 : 143);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

async function main() {
  const rebuildNodeStatus = await runCommand("npm run rebuild:native:node");
  if (rebuildNodeStatus !== 0) {
    process.exit(rebuildNodeStatus);
  }

  let commandStatus = 1;

  try {
    commandStatus = await runCommand(command);
  } finally {
    const rebuildElectronStatus = await runCommand("npm run rebuild:native:electron");
    if (rebuildElectronStatus !== 0) {
      process.exit(rebuildElectronStatus);
    }
  }

  process.exit(commandStatus);
}

await main();
