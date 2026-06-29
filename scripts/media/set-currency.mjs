/**
 * Set the app currency in the browser-preview (.dev-data) database.
 * Used when preparing README media in a specific currency.
 *
 *   node scripts/media/set-currency.mjs USD
 *
 * The seed script does NOT clear app_settings, so this persists across reseeds.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DB_PATH = path.join(ROOT, ".dev-data/inventory-monitor.db");
const code = (process.argv[2] ?? "USD").toUpperCase();

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.prepare(
  "INSERT INTO app_settings (key, value) VALUES ('app.currency', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
).run(code);
const got = db.prepare("SELECT value FROM app_settings WHERE key='app.currency'").get();
console.log("app.currency =", got.value);
db.close();
