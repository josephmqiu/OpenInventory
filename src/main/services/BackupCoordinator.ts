import { Effect, type ManagedRuntime } from "effect";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { DatabaseService } from "./DatabaseService";
import { BackupService } from "./BackupService";
import { LanServerService } from "./LanServerService";
import type { AppSnapshot, BackupValidationResult, RestoreComparisonData } from "../../shared/types";

/**
 * Rename with retry — Windows may hold file locks briefly after db.close().
 * Retries up to `retries` times with `delayMs` between attempts.
 */
async function renameWithRetry(
  src: string,
  dest: string,
  retries = 5,
  delayMs = 100,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;
      if (code === "EBUSY" && i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * BackupCoordinator is a plain class (NOT an Effect service) that orchestrates
 * backup, restore, and scheduling. Instantiated in index.ts after the Effect
 * runtime is created, matching the autoUpdateService pattern.
 *
 * It holds a reference to the managedRuntime so it can dispose it during
 * restore (the chicken-and-egg problem: a service can't dispose its own runtime).
 */
export class BackupCoordinator {
  private inFlightBackup: Promise<AppSnapshot> | null = null;
  private runtime: ManagedRuntime.ManagedRuntime<
    DatabaseService | BackupService | LanServerService,
    never
  >;
  private dbPath: string;

  constructor(
    runtime: ManagedRuntime.ManagedRuntime<
      DatabaseService | BackupService | LanServerService,
      never
    >,
    dbPath: string,
  ) {
    this.runtime = runtime;
    this.dbPath = dbPath;
  }

  /** Run a backup. Tracks the in-flight promise for quit safety. */
  async backupNow(): Promise<AppSnapshot> {
    if (this.inFlightBackup) return this.inFlightBackup;

    this.inFlightBackup = this.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        return yield* db.backupNow();
      }),
    );

    try {
      return await this.inFlightBackup;
    } finally {
      this.inFlightBackup = null;
    }
  }

  /**
   * Create a verified local safety backup before applying an app update.
   *
   * This does not depend on the user-configured backup target. It writes under
   * the app data directory so update install can be aborted if we cannot create
   * a local rollback point.
   */
  async createPreUpdateSafetyBackup(updateVersion: string): Promise<{
    backupDir: string;
    databasePath: string;
    fileSize: number;
  }> {
    const safeVersion = updateVersion.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const targetDir = path.join(
      path.dirname(this.dbPath),
      "pre-update-backups",
      `${safeVersion}-${timestamp}`,
    );

    const result = await this.runtime.runPromise(
      Effect.gen(function* () {
        const backup = yield* BackupService;
        return yield* backup.backupToDirectory(this.dbPath, targetDir);
      }.bind(this)),
    );

    return {
      backupDir: path.dirname(result.filePath),
      databasePath: result.filePath,
      fileSize: result.fileSize,
    };
  }

  /**
   * Prepare for an update install by first creating a verified local safety
   * backup. If the user has configured an external backup target, attempt that
   * too, but do not block the update once the local rollback point is safe.
   */
  async prepareForUpdateInstall(updateVersion: string): Promise<{
    safetyBackupDir: string;
    configuredBackupAttempted: boolean;
    configuredBackupSucceeded: boolean;
    configuredBackupError?: string;
  }> {
    await this.awaitPendingBackup();
    const safety = await this.createPreUpdateSafetyBackup(updateVersion);

    const snapshot = await this.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        return yield* db.loadSnapshot();
      }),
    );

    const hasConfiguredTarget = snapshot.backupPlan.targetPath.trim() !== "";
    if (!hasConfiguredTarget) {
      return {
        safetyBackupDir: safety.backupDir,
        configuredBackupAttempted: false,
        configuredBackupSucceeded: false,
      };
    }

    try {
      await this.backupNow();
      return {
        safetyBackupDir: safety.backupDir,
        configuredBackupAttempted: true,
        configuredBackupSucceeded: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[Backup] Configured backup failed before update; local safety backup exists.", error);
      return {
        safetyBackupDir: safety.backupDir,
        configuredBackupAttempted: true,
        configuredBackupSucceeded: false,
        configuredBackupError: message,
      };
    }
  }

  /** Update backup settings. */
  async updateBackupPlan(input: {
    targetPath: string;
    intervalValue: number;
    intervalUnit: "hours" | "days" | "weeks";
    onStartup: boolean;
  }): Promise<AppSnapshot> {
    return this.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        return yield* db.updateBackupPlan(input);
      }),
    );
  }

  /** Validate a backup directory and return comparison data for the restore UI. */
  async validateBackup(backupDir: string): Promise<{
    validation: BackupValidationResult;
    comparison?: RestoreComparisonData;
  }> {
    const validation = await this.runtime.runPromise(
      Effect.gen(function* () {
        const backup = yield* BackupService;
        return yield* backup.validateBackupDirectory(backupDir);
      }),
    );

    if (!validation.valid) {
      return { validation };
    }

    // Build comparison data
    const currentStats = await this.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const snapshot = yield* db.loadSnapshot();
        const movementCount = yield* db.countMovements();
        return {
          items: snapshot.items.length,
          personnel: snapshot.personnel.length,
          movements: movementCount,
          lastActivity: snapshot.backupPlan.lastSuccessfulBackup || "",
        };
      }),
    );

    const manifest = validation.manifest;
    const backupStats = validation.stats ?? manifest?.stats ?? { items: 0, movements: 0, personnel: 0 };

    const comparison: RestoreComparisonData = {
      backup: {
        createdAt: manifest?.createdAt ?? "",
        items: backupStats.items,
        movements: backupStats.movements,
        personnel: backupStats.personnel,
        schemaVersion: manifest?.schemaVersion ?? 0,
        appVersion: manifest?.appVersion ?? "unknown",
      },
      current: {
        lastActivity: currentStats.lastActivity,
        items: currentStats.items,
        movements: currentStats.movements,
        personnel: currentStats.personnel,
      },
      backupIsNewer: false,
    };

    if (manifest?.createdAt && currentStats.lastActivity) {
      comparison.backupIsNewer =
        new Date(manifest.createdAt) > new Date(currentStats.lastActivity);
    }

    return { validation, comparison };
  }

  /**
   * Full coordinated restore:
   * 1. Save .restore-pending.json with settings to preserve
   * 2. Dispose Effect runtime (closes DB + WAL + LAN server)
   * 3. BackupService swaps files (safety copy + file copy)
   * 4. Relaunch app
   */
  async restoreFromBackup(backupDir: string): Promise<void> {
    const dataDir = path.dirname(this.dbPath);
    const backupDbPath = path.join(backupDir, "database.db");
    if (!fs.existsSync(backupDbPath)) {
      throw new Error("No database.db found in backup directory");
    }

    // Step 1: Preflight while the runtime is still alive.
    // Read ALL critical settings so they survive the restore.
    const preserveSettings = await this.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const snapshot = yield* db.loadSnapshot();
        const lanSettings = yield* db.loadLanAccessSettings();
        return {
          "backup.target_path": snapshot.backupPlan.targetPath,
          "backup.interval_value": String(snapshot.backupPlan.schedule.intervalValue),
          "backup.interval_unit": snapshot.backupPlan.schedule.intervalUnit,
          "backup.on_startup": snapshot.backupPlan.schedule.onStartup ? "true" : "false",
          "lan.enabled": lanSettings.enabled ? "true" : "false",
          "lan.port": String(lanSettings.port),
          "lan.access_key": lanSettings.accessKey,
          "app.language": snapshot.language,
        };
      }),
    );

    const restorePendingPath = path.join(dataDir, ".restore-pending.json");
    const restorePending = {
      preserveSettings,
      backupDir,
      restoredAt: new Date().toISOString(),
    };
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const safetyCopyDir = path.join(dataDir, `database-pre-restore-${timestamp}`);
    const walPath = `${this.dbPath}-wal`;
    const shmPath = `${this.dbPath}-shm`;
    const dbFilename = path.basename(this.dbPath);
    const safetyDbPath = path.join(safetyCopyDir, dbFilename);
    const safetyWalPath = path.join(safetyCopyDir, `${dbFilename}-wal`);
    const safetyShmPath = path.join(safetyCopyDir, `${dbFilename}-shm`);

    fs.writeFileSync(restorePendingPath, JSON.stringify(restorePending, null, 2));
    try {
      // Step 2: Dispose the runtime (closes DB connections, stops LAN server).
      await this.runtime.dispose();
    } catch (disposeError) {
      try {
        fs.unlinkSync(restorePendingPath);
      } catch {
        // Ignore cleanup failures and surface the dispose error.
      }
      throw disposeError;
    }

    // Step 3: Swap files (runtime is disposed, so direct fs operations).
    try {
      fs.mkdirSync(safetyCopyDir, { recursive: true });

      if (fs.existsSync(this.dbPath)) {
        await renameWithRetry(this.dbPath, safetyDbPath);
      }
      if (fs.existsSync(walPath)) {
        await renameWithRetry(walPath, safetyWalPath);
      }
      if (fs.existsSync(shmPath)) {
        await renameWithRetry(shmPath, safetyShmPath);
      }

      fs.copyFileSync(backupDbPath, this.dbPath);
    } catch (copyError) {
      // Roll back the original data, clean pending state, and restart cleanly.
      // Only delete + restore if the original was already moved to the safety dir.
      // If mkdirSync failed before any rename, the original DB is still at this.dbPath.
      if (fs.existsSync(safetyDbPath)) {
        try {
          if (fs.existsSync(this.dbPath)) {
            fs.unlinkSync(this.dbPath);
          }
        } catch {
          // Ignore cleanup failures and restore what we can.
        }
        fs.renameSync(safetyDbPath, this.dbPath);
      }
      if (fs.existsSync(safetyWalPath)) {
        fs.renameSync(safetyWalPath, walPath);
      }
      if (fs.existsSync(safetyShmPath)) {
        fs.renameSync(safetyShmPath, shmPath);
      }
      try {
        fs.unlinkSync(restorePendingPath);
      } catch {
        // Ignore cleanup failures during rollback.
      }
      console.error("[Backup] Restore failed after runtime disposal:", copyError);
      app.relaunch();
      app.exit(0);
      return;
    }

    // Step 4: Relaunch.
    app.relaunch();
    app.exit(0);
  }

  /**
   * Wait for any in-flight backup to complete before quitting.
   * Called from gracefulShutdown / before-quit handler.
   */
  async awaitPendingBackup(): Promise<void> {
    if (this.inFlightBackup) {
      try {
        await this.inFlightBackup;
      } catch {
        // Backup error during quit is non-fatal
      }
    }
  }

  // applyRestorePending is in restorePending.ts (extracted to avoid Electron import in tests)
}
