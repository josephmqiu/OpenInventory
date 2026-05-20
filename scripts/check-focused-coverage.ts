import fs from "node:fs";
import path from "node:path";

type Metric = "lines" | "statements" | "branches" | "functions";

interface CoverageMetric {
  pct: number;
}

interface FileCoverage {
  lines: CoverageMetric;
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
}

interface Rule {
  file: string;
  minimums: Partial<Record<Metric, number>>;
}

const rules: Rule[] = [
  {
    file: "src/main/infrastructure/migrations.ts",
    minimums: { lines: 90, statements: 90, branches: 80, functions: 100 },
  },
  {
    file: "src/main/infrastructure/sqlite-pragmas.ts",
    minimums: { lines: 80, statements: 80, functions: 100 },
  },
  {
    file: "src/main/services/BackupService.ts",
    minimums: { lines: 80, statements: 80, functions: 80 },
  },
  {
    file: "src/main/services/BackupCoordinator.ts",
    minimums: { lines: 65, statements: 65, functions: 70 },
  },
  {
    file: "src/main/services/DatabaseService.ts",
    minimums: { lines: 54, statements: 52, branches: 50, functions: 55 },
  },
  {
    file: "src/main/services/restorePending.ts",
    minimums: { lines: 90, statements: 90, branches: 90, functions: 90 },
  },
  {
    file: "src/main/services/postUpdateValidation.ts",
    minimums: { lines: 85, statements: 85, branches: 70, functions: 85 },
  },
  {
    file: "src/main/ipc.ts",
    minimums: { lines: 65, statements: 60, branches: 60, functions: 55 },
  },
];

const summaryPath = path.resolve("coverage", "coverage-summary.json");
if (!fs.existsSync(summaryPath)) {
  console.error(`[focused-coverage] Missing ${summaryPath}. Run npm run test:coverage first.`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8")) as Record<string, FileCoverage>;
const failures: string[] = [];

for (const rule of rules) {
  const normalizedSuffix = rule.file.split(path.sep).join("/");
  const entry = Object.entries(summary).find(([file]) =>
    file.split(path.sep).join("/").endsWith(normalizedSuffix),
  );

  if (!entry) {
    failures.push(`${rule.file}: missing from coverage summary`);
    continue;
  }

  const [, coverage] = entry;
  for (const [metric, minimum] of Object.entries(rule.minimums) as Array<[Metric, number]>) {
    const actual = coverage[metric].pct;
    if (actual < minimum) {
      failures.push(`${rule.file}: ${metric} ${actual}% < ${minimum}%`);
    }
  }
}

if (failures.length > 0) {
  console.error("[focused-coverage] Focused production-risk coverage check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("[focused-coverage] Focused production-risk coverage check passed.");
