import type Database from "better-sqlite3";

/**
 * Apply standard SQLite pragmas for reliability and performance.
 *
 * WAL mode: readers don't block writers (LAN server reads while desktop writes).
 * busy_timeout: retry window instead of instant SQLITE_BUSY (helps with Windows
 *   antivirus scanning journal files mid-write).
 * synchronous FULL: survives both app and OS crashes.
 * foreign_keys: enforce referential integrity.
 */
export function configureSqlitePragmas(db: Database.Database): void {
  const walResult = db.pragma("journal_mode = WAL") as { journal_mode: string }[];
  if (walResult[0]?.journal_mode !== "wal") {
    console.warn(
      `[SQLite] WAL mode did not engage (got "${walResult[0]?.journal_mode}"). ` +
      "Database may be on an unsupported filesystem. Falling back to default journal mode.",
    );
  }
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = FULL");
  db.pragma("foreign_keys = ON");
}
