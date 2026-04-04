import fs from "node:fs";
import path from "node:path";

interface JsonResult {
  duration?: number;
  status?: string;
  retry?: number;
}

interface JsonTest {
  projectName?: string;
  results?: JsonResult[];
}

interface JsonSpec {
  title?: string;
  file?: string;
  line?: number;
  tests?: JsonTest[];
}

interface JsonSuite {
  title?: string;
  file?: string;
  suites?: JsonSuite[];
  specs?: JsonSpec[];
}

interface JsonReport {
  stats?: {
    duration?: number;
    expected?: number;
    skipped?: number;
    unexpected?: number;
    flaky?: number;
  };
  suites?: JsonSuite[];
}

interface SlowEntry {
  duration: number;
  file: string;
  line: number;
  project: string;
  title: string;
  status: string;
}

function collectSpecs(suite: JsonSuite, entries: SlowEntry[]): void {
  for (const spec of suite.specs ?? []) {
    const results = spec.tests?.flatMap((test) =>
      (test.results ?? []).map((result) => ({
        duration: result.duration ?? 0,
        file: spec.file ?? suite.file ?? "unknown",
        line: spec.line ?? 0,
        project: test.projectName ?? "unknown",
        title: spec.title ?? "unknown",
        status: result.status ?? "unknown",
      }))
    ) ?? [];

    if (results.length > 0) {
      const slowest = results.reduce((current, next) =>
        next.duration > current.duration ? next : current,
      );
      entries.push(slowest);
    }
  }

  for (const child of suite.suites ?? []) {
    collectSpecs(child, entries);
  }
}

function formatMs(duration: number): string {
  if (duration >= 60_000) {
    return `${(duration / 60_000).toFixed(2)}m`;
  }
  if (duration >= 1_000) {
    return `${(duration / 1_000).toFixed(2)}s`;
  }
  return `${duration}ms`;
}

function main(): void {
  const reportPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), "test-results/e2e-report.json");

  if (!fs.existsSync(reportPath)) {
    console.error(`[e2e-report] Report not found: ${reportPath}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as JsonReport;
  const entries: SlowEntry[] = [];
  for (const suite of report.suites ?? []) {
    collectSpecs(suite, entries);
  }

  const slowest = [...entries].sort((a, b) => b.duration - a.duration).slice(0, 10);
  const stats = report.stats ?? {};

  console.log("[e2e-report] Summary");
  console.log(
    `  expected=${stats.expected ?? 0} flaky=${stats.flaky ?? 0} skipped=${stats.skipped ?? 0} unexpected=${stats.unexpected ?? 0} duration=${formatMs(stats.duration ?? 0)}`,
  );

  if (slowest.length === 0) {
    console.log("  no test timing data found");
    return;
  }

  console.log("[e2e-report] Slowest tests");
  for (const entry of slowest) {
    console.log(
      `  ${formatMs(entry.duration).padStart(8)}  [${entry.project}] ${entry.file}:${entry.line}  ${entry.title} (${entry.status})`,
    );
  }
}

main();
