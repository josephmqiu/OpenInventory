import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    if (!/\.(ts|tsx)$/.test(fullPath) || /\.test\./.test(fullPath)) {
      return [];
    }
    return [fullPath];
  });
}

const rendererRoot = path.resolve(import.meta.dirname, "..");
const sourceFiles = collectSourceFiles(rendererRoot).filter((filePath) =>
  !filePath.endsWith(path.join("app", "i18nResources.ts")) &&
  !filePath.endsWith(path.join("app", "i18n.ts")) &&
  !filePath.includes(`${path.sep}test${path.sep}`),
);

describe("renderer i18n guardrails", () => {
  it("does not reintroduce the legacy dictionary path", () => {
    const bannedPatterns = [
      /dictionary\?:/u,
      /dictionary:/u,
      /dictionaries\[language\]/u,
      /import\s+\{\s*dictionaries/u,
      /\bDictionary\b/u,
    ];

    const matches = sourceFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, "utf8");
      return bannedPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${path.relative(rendererRoot, filePath)} -> ${pattern}`);
    });

    expect(matches).toEqual([]);
  });

  it("does not inline zh/en UI branching in renderer components", () => {
    const allowlist = new Set([
      path.join("ui", "components", "LanAccessPanel.tsx"),
    ]);

    const matches = sourceFiles.flatMap((filePath) => {
      const relativePath = path.relative(rendererRoot, filePath);
      if (allowlist.has(relativePath)) {
        return [];
      }

      const content = readFileSync(filePath, "utf8");
      const found: string[] = [];
      if (/defaultValue:\s*language\s*===\s*"zh-CN"/u.test(content)) {
        found.push(`${relativePath} -> defaultValue zh/en branch`);
      }
      if (/language\s*===\s*"zh-CN"\s*\?/u.test(content)) {
        found.push(`${relativePath} -> inline zh/en ternary`);
      }
      return found;
    });

    expect(matches).toEqual([]);
  });
});
