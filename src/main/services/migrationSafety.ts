import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Pre-migration safety: a verified rollback point and a downgrade guard, applied
 * in initializeDatabase() before any schema change. Kept free of Electron imports
 * so it can be unit-tested without a running app.
 */

/** Read the schema version without requiring the schema_migrations table to exist.
 *  Returns 0 for a database that predates the migration system. */
export function readSchemaVersionSafe(db: Database.Database): number {
  try {
    const row = db
      .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
      .get() as { v: number };
    return row.v;
  } catch {
    return 0;
  }
}

/**
 * Create a verified online backup of the database BEFORE any schema change, and
 * return the backup directory.
 *
 * Throws if the snapshot cannot be created or fails its integrity check, so the
 * caller can refuse to migrate without a rollback point. The snapshot uses
 * SQLite's online backup API, so it folds in WAL state and is internally
 * consistent even if other connections exist.
 */
export async function backupBeforeMigrate(
  db: Database.Database,
  dbPath: string,
  fromVersion: number,
  toVersion: number,
): Promise<string> {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const dir = path.join(
    path.dirname(dbPath),
    "pre-update-backups",
    `migrate-v${fromVersion}-to-v${toVersion}-${timestamp}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "database.db");

  await db.backup(dest);

  const verify = new Database(dest, { readonly: true });
  try {
    const result = verify
      .prepare("PRAGMA integrity_check(1)")
      .get() as { integrity_check: string };
    if (result.integrity_check !== "ok") {
      throw new Error(
        `pre-migration backup failed integrity check: ${result.integrity_check}`,
      );
    }
  } finally {
    verify.close();
  }
  return dir;
}
