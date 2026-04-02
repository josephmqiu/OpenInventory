import { Effect, type ManagedRuntime } from "effect";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { DatabaseService } from "./DatabaseService";
import { BackupService } from "./BackupService";
import { LanServerService } from "./LanServerService";
import type { AppSnapshot, BackupValidationResult, RestoreComparisonData } from "../../shared/types";

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
        return {
          items: snapshot.items.length,
          personnel: snapshot.personnel.length,
          movements: 0, // Movement count requires a query not exposed via snapshot
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

    // Step 1: Save settings that need to survive the restore
    const currentTargetPath = await this.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const snapshot = yield* db.loadSnapshot();
        return snapshot.backupPlan.targetPath;
      }),
    );

    const restorePending = {
      preserveSettings: {
        "backup.target_path": currentTargetPath,
      },
      backupDir,
      restoredAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(dataDir, ".restore-pending.json"),
      JSON.stringify(restorePending, null, 2),
    );

    // Step 2: Dispose the runtime (closes DB connections, stops LAN server)
    await this.runtime.dispose();

    // Step 3: Swap files (runtime is disposed, so direct fs operations)
    const backupDbPath = path.join(backupDir, "database.db");
    if (!fs.existsSync(backupDbPath)) {
      throw new Error("No database.db found in backup directory");
    }

    // Safety copy: move current DB + WAL + SHM to timestamped directory
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const safetyCopyDir = path.join(dataDir, `database-pre-restore-${timestamp}`);
    fs.mkdirSync(safetyCopyDir, { recursive: true });

    if (fs.existsSync(this.dbPath)) {
      fs.renameSync(this.dbPath, path.join(safetyCopyDir, path.basename(this.dbPath)));
    }
    const walPath = `${this.dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      fs.renameSync(walPath, path.join(safetyCopyDir, `${path.basename(this.dbPath)}-wal`));
    }
    const shmPath = `${this.dbPath}-shm`;
    if (fs.existsSync(shmPath)) {
      fs.renameSync(shmPath, path.join(safetyCopyDir, `${path.basename(this.dbPath)}-shm`));
    }

    // Copy backup database with rollback on failure
    try {
      fs.copyFileSync(backupDbPath, this.dbPath);
    } catch (copyError) {
      // Rollback: move safety copy back to original location
      const safetyDbPath = path.join(safetyCopyDir, path.basename(this.dbPath));
      if (fs.existsSync(safetyDbPath)) {
        fs.renameSync(safetyDbPath, this.dbPath);
      }
      const safetyWalPath = path.join(safetyCopyDir, `${path.basename(this.dbPath)}-wal`);
      if (fs.existsSync(safetyWalPath)) {
        fs.renameSync(safetyWalPath, walPath);
      }
      const safetyShmPath = path.join(safetyCopyDir, `${path.basename(this.dbPath)}-shm`);
      if (fs.existsSync(safetyShmPath)) {
        fs.renameSync(safetyShmPath, shmPath);
      }
      throw new Error(`Restore failed during file copy: ${copyError instanceof Error ? copyError.message : copyError}. Original database has been preserved.`);
    }

    // Step 4: Relaunch
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
