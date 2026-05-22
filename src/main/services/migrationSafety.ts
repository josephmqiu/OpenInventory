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

/** The most recent pre-update backup directory containing a database.db, or null.
 *  "Newest" is correct: it is the snapshot taken just before the change that failed. */
export function findLatestPreUpdateBackup(dbPath: string): string | null {
  const root = path.join(path.dirname(dbPath), "pre-update-backups");
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return null; // no backups directory yet
  }
  const candidates = names
    .map((name) => path.join(root, name))
    .map((dir) => ({ dir, dbFile: path.join(dir, "database.db") }))
    .filter(({ dbFile }) => fs.existsSync(dbFile))
    .map(({ dir, dbFile }) => ({ dir, mtime: fs.statSync(dbFile).mtimeMs }))
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
  const failedDir = path.join(
    path.dirname(dbPath),
    `database-failed-update-${fileTimestamp()}`,
  );
  fs.mkdirSync(failedDir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const live = `${dbPath}${suffix}`;
    if (!fs.existsSync(live)) continue;
    try {
      fs.renameSync(live, path.join(failedDir, path.basename(live)));
    } catch {
      // Could not preserve it — remove so it cannot corrupt the restored DB.
      fs.rmSync(live, { force: true });
    }
  }
  fs.copyFileSync(backupDb, dbPath);
}

// ─── Rollback loop guard ─────────────────────────────────────────────────────
// After a rollback, the DB is back at its old (lower) version. The next boot
// would migrate, fail, and offer the same backup again — an infinite loop. A
// persisted marker records the rollback so the next boot halts instead of
// re-attempting the upgrade that just failed.

export interface RollbackMarker {
  rolledBackFrom: number; // schema version the failed upgrade targeted
  rolledBackTo: number; // schema version restored
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

/** True when a marker shows this exact upgrade already failed and was rolled back,
 *  so the app should halt rather than retry the same migration. A marker from an
 *  older app version (rolledBackFrom !== current latest) is stale and ignored. */
export function isBlockedByRollback(
  dbPath: string,
  currentVersion: number,
  latestVersion: number,
): boolean {
  const marker = readRollbackMarker(dbPath);
  if (!marker) return false;
  return (
    marker.rolledBackFrom === latestVersion &&
    currentVersion === marker.rolledBackTo &&
    currentVersion < latestVersion
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
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const ordered = names
    .map((name) => path.join(root, name))
    .map((dir) => ({ dir, dbFile: path.join(dir, "database.db") }))
    .filter(({ dbFile }) => fs.existsSync(dbFile))
    .map(({ dir, dbFile }) => ({ dir, mtime: fs.statSync(dbFile).mtimeMs }))
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
