import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards the auto-update publish channel.
//
// The updater is provider-agnostic — the feed URL lives ONLY in these config
// files, never in code. A silent revert to the retired Cloudflare R2 (`generic`)
// provider, or a fat-fingered owner/repo, would ship a BROKEN update channel with
// no other signal (broken auto-update is the entire point of the migration). The
// release workflow does not validate the provider, so this test is the guard.
//
//   app-update.yml (baked at build time) ◀── electron-builder.yml publish:
//   dev feed (unpackaged) ◀── dev-app-update.yml
//   electron-builder.yml is authoritative; package.json must carry NO publish block.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(file: string): string {
  return readFileSync(join(repoRoot, file), "utf-8");
}

describe("auto-update publish config", () => {
  const builder = read("electron-builder.yml");
  const devFeed = read("dev-app-update.yml");

  it("electron-builder.yml publishes to the github provider", () => {
    expect(builder).toMatch(/provider:\s*github/);
    expect(builder).toMatch(/owner:\s*josephmqiu/);
    expect(builder).toMatch(/repo:\s*OpenInventory/);
  });

  it("dev-app-update.yml points at the same github repo", () => {
    expect(devFeed).toMatch(/provider:\s*github/);
    expect(devFeed).toMatch(/owner:\s*josephmqiu/);
    expect(devFeed).toMatch(/repo:\s*OpenInventory/);
  });

  it("no update config still references the retired R2 / generic provider", () => {
    for (const [name, content] of [
      ["electron-builder.yml", builder],
      ["dev-app-update.yml", devFeed],
    ] as const) {
      expect(content, `${name} must not reference R2`).not.toMatch(/r2\.dev/);
      expect(content, `${name} must not use the generic provider`).not.toMatch(
        /provider:\s*generic/,
      );
    }
  });

  it("package.json carries no stray publish block (electron-builder.yml is the single source of truth)", () => {
    const pkg = JSON.parse(read("package.json")) as { publish?: unknown };
    expect(pkg.publish).toBeUndefined();
  });
});
