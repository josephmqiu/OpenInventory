import { execSync } from "child_process";

// Rebuild better-sqlite3 for Electron's Node version
execSync("npx electron-rebuild -f -o better-sqlite3", { stdio: "inherit" });

// On macOS, ad-hoc sign the native module (required by Apple's code signing)
if (process.platform === "darwin") {
  execSync(
    "codesign --force --sign - node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    { stdio: "inherit" },
  );
}
