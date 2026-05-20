import Database from "better-sqlite3";
import { currentVersion, LATEST_MIGRATION_VERSION } from "../infrastructure/migrations";

const LAST_VALIDATED_VERSION_KEY = "app.last_validated_version";
const LAST_VALIDATED_AT_KEY = "app.last_validated_at";

const REQUIRED_TABLES = [
  "inventory_items",
  "inventory_movements",
  "low_stock_alerts",
  "personnel",
  "app_settings",
  "schema_migrations",
];

export interface PostUpdateValidationCheck {
  readonly required: boolean;
  readonly previousVersion: string;
  readonly currentVersion: string;
  readonly errors: string[];
}

function readSetting(db: Database.Database, key: string): string {
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? "";
  } catch {
    return "";
  }
}

function writeSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function checkPostUpdateDatabase(
  dbPath: string,
  appVersion: string,
): PostUpdateValidationCheck {
  const db = new Database(dbPath);
  try {
    const previousVersion = readSetting(db, LAST_VALIDATED_VERSION_KEY);
    const required = previousVersion !== appVersion;
    const errors: string[] = [];

    if (!required) {
      return {
        required,
        previousVersion,
        currentVersion: appVersion,
        errors,
      };
    }

    const integrity = db
      .prepare("PRAGMA integrity_check(1)")
      .get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") {
      errors.push(`integrity_check failed: ${integrity.integrity_check}`);
    }

    const foreignKeyRows = db.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyRows.length > 0) {
      errors.push(`foreign_key_check found ${foreignKeyRows.length} violation(s)`);
    }

    for (const table of REQUIRED_TABLES) {
      const row = db
        .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table) as { count: number };
      if (row.count !== 1) {
        errors.push(`missing required table: ${table}`);
      }
    }

    const schemaVersion = currentVersion(db);
    if (schemaVersion !== LATEST_MIGRATION_VERSION) {
      errors.push(
        `schema version ${schemaVersion} does not match app schema ${LATEST_MIGRATION_VERSION}`,
      );
    }

    return {
      required,
      previousVersion,
      currentVersion: appVersion,
      errors,
    };
  } finally {
    db.close();
  }
}

export function markPostUpdateValidationSucceeded(
  dbPath: string,
  appVersion: string,
): void {
  const db = new Database(dbPath);
  try {
    const update = db.transaction(() => {
      writeSetting(db, LAST_VALIDATED_VERSION_KEY, appVersion);
      writeSetting(db, LAST_VALIDATED_AT_KEY, new Date().toISOString());
    });
    update();
  } finally {
    db.close();
  }
}
