import { execSync } from "child_process";

const betterSqliteBinary = "node_modules/better-sqlite3/build/Release/better_sqlite3.node";

execSync("npx electron-rebuild -f -o better-sqlite3", { stdio: "inherit" });

if (process.platform === "darwin") {
  execSync(`codesign --force --sign - "${betterSqliteBinary}"`, {
    stdio: "inherit",
  });
}
