import { Effect, Context, Layer } from "effect";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { IoError, type AppError } from "../domain/errors";
import type { BackupManifest, BackupValidationResult } from "../../shared/types";
import { LATEST_MIGRATION_VERSION } from "../infrastructure/migrations";

// ─── Constants ──────────────────────────────────────────────────────────────

const BACKUP_DIR_NAME = "OpenInventory-Backup";
const DB_FILENAME = "database.db";
const DB_TEMP_FILENAME = "database.tmp.db";
const MANIFEST_FILENAME = "manifest.json";

// Required tables that must exist in a valid OpenInventory database.
const REQUIRED_TABLES = [
  "inventory_items",
  "inventory_movements",
  "low_stock_alerts",
  "personnel",
  "app_settings",
];

// ─── Service Interface ──────────────────────────────────────────────────────

export interface BackupServiceApi {
  /** Write a backup to {targetDir}/OpenInventory-Backup/ using safe write. */
  readonly backupToDirectory: (
    sourcePath: string,
    targetDir: string,
  ) => Effect.Effect<{ filePath: string; fileSize: number; manifest: BackupManifest }, AppError>;

  /** Validate a backup directory: read manifest, check DB integrity/schema. */
  readonly validateBackupDirectory: (
    dirPath: string,
  ) => Effect.Effect<BackupValidationResult, AppError>;

  /** Restore: safety-copy current DB, then copy backup DB to app location. */
  readonly restoreFromDirectory: (
    backupDir: string,
    appDbPath: string,
  ) => Effect.Effect<void, AppError>;
}

export class BackupService extends Context.Tag("BackupService")<
  BackupService,
  BackupServiceApi
>() {}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function countRows(db: Database.Database, table: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM "${table}"`)
    .get() as { c: number };
  return row.c;
}

function verifyDatabase(dbPath: string): {
  valid: boolean;
  error?: string;
  stats?: { items: number; movements: number; personnel: number };
  schemaVersion?: number;
} {
  let verifyDb: Database.Database | null = null;
  try {
    verifyDb = new Database(dbPath, { readonly: true });
    verifyDb.pragma("trusted_schema = OFF");

    // Integrity check
    const integrity = verifyDb
      .prepare("PRAGMA integrity_check(1)")
      .get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") {
      return { valid: false, error: `Integrity check failed: ${integrity.integrity_check}` };
    }

    // Check required tables
    const tables = getTableNames(verifyDb);
    for (const required of REQUIRED_TABLES) {
      if (!tables.includes(required)) {
        return { valid: false, error: `Missing required table: ${required}` };
      }
    }

    // Count rows
    const stats = {
      items: countRows(verifyDb, "inventory_items"),
      movements: countRows(verifyDb, "inventory_movements"),
      personnel: countRows(verifyDb, "personnel"),
    };

    // Schema version (may not have schema_migrations table in very old DBs)
    let schemaVersion = 0;
    if (tables.includes("schema_migrations")) {
      const row = verifyDb
        .prepare("SELECT COALESCE(MAX(version), 0) as v FROM schema_migrations")
        .get() as { v: number };
      schemaVersion = row.v;
    }

    return { valid: true, stats, schemaVersion };
  } catch (e) {
    return { valid: false, error: `Failed to open database: ${e}` };
  } finally {
    verifyDb?.close();
  }
}

function readManifest(dirPath: string): BackupManifest | null {
  const manifestPath = path.join(dirPath, MANIFEST_FILENAME);
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as BackupManifest;
  } catch {
    return null;
  }
}

// ─── Service Implementation ─────────────────────────────────────────────────

export const BackupServiceLive: Layer.Layer<BackupService> = Layer.succeed(
  BackupService,
  {
    backupToDirectory: (sourcePath: string, targetDir: string) =>
      Effect.tryPromise({
        try: async () => {
          const backupDir = path.join(targetDir, BACKUP_DIR_NAME);
          fs.mkdirSync(backupDir, { recursive: true });

          // Disk space check: ensure at least 2x the source DB size is available
          try {
            const sourceSize = fs.statSync(sourcePath).size;
            const stats = fs.statfsSync(backupDir);
            const availableBytes = stats.bavail * stats.bsize;
            if (availableBytes < sourceSize * 2) {
              throw new Error(
                `Insufficient disk space. Need ${Math.ceil((sourceSize * 2) / 1024 / 1024)} MB, ` +
                `have ${Math.ceil(availableBytes / 1024 / 1024)} MB available.`,
              );
            }
          } catch (e) {
            // statfsSync may not be available on all platforms; proceed if check fails
            if (e instanceof Error && e.message.includes("Insufficient disk space")) throw e;
          }

          const tempPath = path.join(backupDir, DB_TEMP_FILENAME);
          const finalPath = path.join(backupDir, DB_FILENAME);

          // Step 1: Backup to temp file
          const source = new Database(sourcePath, { readonly: true });
          try {
            await source.backup(tempPath);
          } finally {
            source.close();
          }

          // Step 2: Verify temp file
          const verification = verifyDatabase(tempPath);
          if (!verification.valid) {
            // Clean up temp file, keep existing backup intact
            try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
            throw new Error(`Backup verification failed: ${verification.error}`);
          }

          // Step 3: Atomic rename (temp → final)
          fs.renameSync(tempPath, finalPath);

          const fileSize = fs.statSync(finalPath).size;
          const checksum = sha256File(finalPath);

          // Step 4: Write manifest (convenience, not a gate)
          const appVersion = process.env.npm_package_version || "unknown";
          const manifest: BackupManifest = {
            formatVersion: 1,
            appVersion,
            schemaVersion: verification.schemaVersion ?? 0,
            createdAt: new Date().toISOString(),
            platform: process.platform,
            stats: verification.stats ?? { items: 0, movements: 0, personnel: 0 },
            checksums: { database: `sha256:${checksum}` },
          };

          const manifestPath = path.join(backupDir, MANIFEST_FILENAME);
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

          return { filePath: finalPath, fileSize, manifest };
        },
        catch: (e) =>
          new IoError({
            messageId: "backupOperationFailed",
            debugMessage: `Backup failed: ${e instanceof Error ? e.message : e}`,
          }),
      }),

    validateBackupDirectory: (dirPath: string) =>
      Effect.try({
        try: () => {
          const dbPath = path.join(dirPath, DB_FILENAME);

          if (!fs.existsSync(dbPath)) {
            return { valid: false, error: "No database.db found in backup directory" };
          }

          // Try manifest first (fast path)
          const manifest = readManifest(dirPath);

          // Verify DB regardless of manifest
          const verification = verifyDatabase(dbPath);
          if (!verification.valid) {
            return { valid: false, error: verification.error };
          }

          // Check future schema version
          const latestMigration = LATEST_MIGRATION_VERSION;
          if (verification.schemaVersion && verification.schemaVersion > latestMigration) {
            return {
              valid: false,
              error: `This backup is from a newer version of the app (schema v${verification.schemaVersion}). Update the app first.`,
            };
          }

          return {
            valid: true,
            manifest: manifest ?? undefined,
            stats: verification.stats,
          } as BackupValidationResult;
        },
        catch: (e) =>
          new IoError({
            messageId: "backupValidationFailed",
            debugMessage: `Validation failed: ${e instanceof Error ? e.message : e}`,
          }),
      }),

    restoreFromDirectory: (backupDir: string, appDbPath: string) =>
      Effect.try({
        try: () => {
          const sourceDb = path.join(backupDir, DB_FILENAME);
          if (!fs.existsSync(sourceDb)) {
            throw new Error("No database.db found in backup directory");
          }

          // Safety copy: move current DB + WAL + SHM to a timestamped directory
          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .replace("T", "_")
            .slice(0, 19);
          const safetyCopyDir = path.join(
            path.dirname(appDbPath),
            `database-pre-restore-${timestamp}`,
          );
          fs.mkdirSync(safetyCopyDir, { recursive: true });

          // Move main DB file
          if (fs.existsSync(appDbPath)) {
            fs.renameSync(appDbPath, path.join(safetyCopyDir, path.basename(appDbPath)));
          }
          // Move WAL file if present
          const walPath = `${appDbPath}-wal`;
          if (fs.existsSync(walPath)) {
            fs.renameSync(walPath, path.join(safetyCopyDir, `${path.basename(appDbPath)}-wal`));
          }
          // Move SHM file if present
          const shmPath = `${appDbPath}-shm`;
          if (fs.existsSync(shmPath)) {
            fs.renameSync(shmPath, path.join(safetyCopyDir, `${path.basename(appDbPath)}-shm`));
          }

          // Copy backup database to app location
          fs.copyFileSync(sourceDb, appDbPath);
        },
        catch: (e) =>
          new IoError({
            messageId: "backupRestoreFailed",
            debugMessage: `Restore failed: ${e instanceof Error ? e.message : e}`,
          }),
      }),
  },
);
