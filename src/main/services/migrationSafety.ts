import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Pre-migration safety: a verified rollback point, a downgrade guard, and a
 * confirmed rollback path on a failed upgrade, applied around initializeDatabase().
 * Kept free of Electron imports so it can be unit-tested without a running app.
 */

function fileTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
}

/** Thrown when schema.sql or the migration chain fails to apply. Distinct type so
 *  the startup catch only offers a rollback for genuine upgrade failures — never
 *  for fatal conditions (corruption, downgrade, blocked rollback) that exit. */
export class StartupMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupMigrationError";
  }
}

/** Apply a multi-statement schema file via prepared statements (no shell exec). */
export function applySchemaSql(db: Database.Database, sql: string): void {
  const withoutComments = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  for (const statement of withoutComments.split(";")) {
    const trimmed = statement.trim();
    if (trimmed) db.prepare(trimmed).run();
  }
}

/** Open a DB read-only and confirm it passes a quick integrity check. */
function isDatabaseHealthy(file: string): boolean {
  let db: Database.Database | undefined;
  try {
    db = new Database(file, { readonly: true });
    const row = db.prepare("PRAGMA integrity_check(1)").get() as {
      integrity_check: string;
    };
    return row.integrity_check === "ok";
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

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
  const dir = path.join(
    path.dirname(dbPath),
    "pre-update-backups",
    `migrate-v${fromVersion}-to-v${toVersion}-${fileTimestamp()}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, "database.db");
  const tempPath = path.join(dir, "database.tmp.db");

  try {
    await db.backup(tempPath);
    if (!isDatabaseHealthy(tempPath)) {
      throw new Error("pre-migration backup failed its integrity check");
    }
    // Atomic publish: discovery only ever sees a fully verified database.db.
    fs.renameSync(tempPath, finalPath);
  } catch (error) {
    // Leave no partial backup that discovery could later select as a rollback source.
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return dir;
}

/** All database.db files under a directory tree (bounded depth). Finds both the
 *  migration-time backups (pre-update-backups/<run>/database.db) and the
 *  auto-update safety backups, which nest one level deeper under a backup folder. */
function findDatabaseFiles(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findDatabaseFiles(full, depth + 1));
    } else if (entry.name === "database.db") {
      found.push(full);
    }
  }
  return found;
}

/** The directory containing the newest VALID pre-update backup database.db, or
 *  null. Searches recursively (both backup layouts) and skips any backup that
 *  fails its integrity check. "Newest" is correct: it is the snapshot just before
 *  the change that failed. */
export function findLatestPreUpdateBackup(dbPath: string): string | null {
  const root = path.join(path.dirname(dbPath), "pre-update-backups");
  const candidates = findDatabaseFiles(root)
    .filter((dbFile) => isDatabaseHealthy(dbFile))
    .map((dbFile) => ({ dir: path.dirname(dbFile), mtime: fs.statSync(dbFile).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates.length > 0 ? candidates[0].dir : null;
}

/**
 * Replace the (broken) live database with a pre-update backup. Synchronous and
 * Electron-free: the caller must have closed all DB connections first.
 *
 * The broken database and its WAL/SHM siblings are moved aside for forensics;
 * if they cannot be moved they are removed, because a stale -wal applied over the
 * restored database would corrupt it. The backup is a single checkpointed file,
 * so only database.db is copied in.
 */
export function restorePreUpdateBackup(dbPath: string, backupDir: string): void {
  const backupDb = path.join(backupDir, "database.db");
  if (!fs.existsSync(backupDb)) {
    throw new Error(`No database.db in backup directory: ${backupDir}`);
  }
  if (!isDatabaseHealthy(backupDb)) {
    throw new Error(`Backup database is not healthy: ${backupDb}`);
  }

  // Stage a verified copy NEXT to the live DB before touching any live file. If
  // anything here throws, the live database is still in place and untouched.
  const stagedPath = `${dbPath}.restore-tmp`;
  fs.rmSync(stagedPath, { force: true });
  fs.copyFileSync(backupDb, stagedPath);
  if (!isDatabaseHealthy(stagedPath)) {
    fs.rmSync(stagedPath, { force: true });
    throw new Error("staged restore copy failed its integrity check");
  }

  // Move the broken live files aside for forensics, tracking each move so it can
  // be undone if the final swap fails.
  const failedDir = path.join(
    path.dirname(dbPath),
    `database-failed-update-${fileTimestamp()}`,
  );
  fs.mkdirSync(failedDir, { recursive: true });
  const moved: Array<{ from: string; to: string }> = [];
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      const live = `${dbPath}${suffix}`;
      if (!fs.existsSync(live)) continue;
      const to = path.join(failedDir, path.basename(live));
      fs.renameSync(live, to);
      moved.push({ from: live, to });
    }
    // Atomic publish on the same volume. The backup is a single checkpointed file,
    // so no stale -wal/-shm remain beside the restored database.
    fs.renameSync(stagedPath, dbPath);
  } catch (error) {
    // Undo: restore the live files we moved; live state is preserved intact.
    for (const { from, to } of moved) {
      try {
        if (!fs.existsSync(from)) fs.renameSync(to, from);
      } catch {
        // best-effort recovery
      }
    }
    fs.rmSync(stagedPath, { force: true });
    throw error;
  }
}

// ─── Rollback loop guard ─────────────────────────────────────────────────────
// After a rollback, the DB is back at its old (lower) version. The next boot
// would migrate, fail, and offer the same backup again — an infinite loop. A
// persisted marker records the rollback so the next boot halts instead of
// re-attempting the upgrade that just failed.

export interface RollbackMarker {
  appVersion: string; // the app build whose upgrade failed and was rolled back
  schemaVersion: number; // the schema version restored to
  at: string;
}

function rollbackMarkerPath(dbPath: string): string {
  return path.join(path.dirname(dbPath), ".rollback-marker.json");
}

export function readRollbackMarker(dbPath: string): RollbackMarker | null {
  try {
    return JSON.parse(
      fs.readFileSync(rollbackMarkerPath(dbPath), "utf-8"),
    ) as RollbackMarker;
  } catch {
    return null;
  }
}

export function writeRollbackMarker(dbPath: string, marker: RollbackMarker): void {
  fs.writeFileSync(rollbackMarkerPath(dbPath), JSON.stringify(marker, null, 2));
}

export function clearRollbackMarker(dbPath: string): void {
  try {
    fs.unlinkSync(rollbackMarkerPath(dbPath));
  } catch {
    // Absent marker is the normal case.
  }
}

/** True when THIS app build already failed to upgrade THIS data state and rolled
 *  back, so the boot should halt rather than retry the same failure. Keyed on app
 *  version (not schema delta) so it also catches a no-schema-change update that
 *  fails post-update validation, and so a newer build (the fix) is never blocked. */
export function isBlockedByRollback(
  dbPath: string,
  currentAppVersion: string,
  currentSchemaVersion: number,
): boolean {
  const marker = readRollbackMarker(dbPath);
  if (!marker) return false;
  return (
    marker.appVersion === currentAppVersion &&
    marker.schemaVersion === currentSchemaVersion
  );
}

/**
 * Keep only the newest `keep` pre-update backups, deleting older ones. Disk
 * hygiene for long-lived machines that update many times. Best-effort and
 * non-fatal; returns the directories actually removed.
 *
 * Count-based, never age-based: the newest backup is always the rollback target,
 * so keeping the N most recent guarantees rollback stays possible. `keep` is
 * floored at 1 so this can never delete every backup.
 */
export function prunePreUpdateBackups(dbPath: string, keep = 3): string[] {
  const root = path.join(path.dirname(dbPath), "pre-update-backups");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  // Each top-level entry is one backup (database.db may be nested inside it). Rank
  // by the newest database.db it contains.
  const ordered = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = path.join(root, e.name);
      const dbFiles = findDatabaseFiles(dir);
      const mtime = dbFiles.length
        ? Math.max(...dbFiles.map((f) => fs.statSync(f).mtimeMs))
        : 0;
      return { dir, mtime, hasDb: dbFiles.length > 0 };
    })
    .filter((d) => d.hasDb)
    .sort((a, b) => b.mtime - a.mtime);

  const removed: string[] = [];
  for (const { dir } of ordered.slice(Math.max(keep, 1))) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch {
      // Best-effort hygiene — leave it for next time.
    }
  }
  return removed;
}
