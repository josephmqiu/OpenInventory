import { execSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const hashFile = "node_modules/.electron-rebuild-hash";
const betterSqliteBinary =
  "node_modules/better-sqlite3/build/Release/better_sqlite3.node";

function computeCacheKey(): string {
  const electronPkg = JSON.parse(
    readFileSync("node_modules/electron/package.json", "utf-8"),
  );
  const lockfile = existsSync("package-lock.json")
    ? readFileSync("package-lock.json", "utf-8")
    : "";
  const hash = createHash("sha256")
    .update(electronPkg.version)
    .update(process.platform)
    .update(process.arch)
    .update(lockfile)
    .digest("hex")
    .slice(0, 16);
  return `${electronPkg.version}-${process.platform}-${process.arch}-${hash}`;
}

const cacheKey = computeCacheKey();
const electronVersion = cacheKey.split("-")[0];
const platformArch = `${process.platform}-${process.arch}`;

if (existsSync(hashFile) && readFileSync(hashFile, "utf-8").trim() === cacheKey) {
  console.log(
    `Native modules up to date (Electron ${electronVersion}, ${platformArch}). Skipping rebuild.`,
  );
} else {
  console.log(
    `Rebuilding native modules for Electron ${electronVersion} (${platformArch})...`,
  );
  execSync("npx electron-rebuild -f", { stdio: "inherit" });

  if (process.platform === "darwin") {
    execSync(`codesign --force --sign - "${betterSqliteBinary}"`, {
      stdio: "inherit",
    });
  }

  writeFileSync(hashFile, cacheKey, "utf-8");
}
