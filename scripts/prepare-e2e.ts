import { execSync } from "child_process";

execSync("npx tsx scripts/rebuild-electron-native-deps.ts", { stdio: "inherit" });
