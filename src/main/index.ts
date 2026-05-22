import { app, BrowserWindow, dialog, shell } from "electron";
import { join } from "path";
import { Effect, Layer, ManagedRuntime } from "effect";
import { is } from "@electron-toolkit/utils";

// ─── Module-level shutdown state ────────────────────────────────────────────
// Hoisted so the uncaughtException / unhandledRejection handlers (registered
// before app.whenReady) can attempt a graceful flush when they fire *after*
// the runtime has been initialised.
let disposed = false;
let backupScheduler: { stop(): void } | null = null;
let backupCoordinator: { awaitPendingBackup(): Promise<void> } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed fully inside whenReady(); only dispose() is used from error handlers
let managedRuntime: ManagedRuntime.ManagedRuntime<any, any> | null = null;

// Surface fatal startup errors instead of silently exiting.
// These handlers attempt a 2-second emergency shutdown to flush in-flight
// mutations before exiting.  The module-level refs may still be null if the
// error fires during early startup, so use optional chaining.
process.on("uncaughtException", (err) => {
  dialog.showErrorBox("OpenInventory — Fatal Error", err.stack ?? err.message);
  const emergencyShutdown = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    backupScheduler?.stop();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
    await Promise.race([
      backupCoordinator?.awaitPendingBackup()
        .then(() => managedRuntime?.dispose())
        .catch(() => {}),
      timeout,
    ]);
  };
  void emergencyShutdown().finally(() => app.exit(1));
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error
    ? (reason.stack ?? reason.message)
    : String(reason);
  dialog.showErrorBox("OpenInventory — Fatal Error", message);
  const emergencyShutdown = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    backupScheduler?.stop();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
    await Promise.race([
      backupCoordinator?.awaitPendingBackup()
        .then(() => managedRuntime?.dispose())
        .catch(() => {}),
      timeout,
    ]);
  };
  void emergencyShutdown().finally(() => app.exit(1));
});

import { DatabaseService, makeDatabaseLayer } from "./services/DatabaseService";
import { NotificationServiceLive } from "./services/NotificationService";
import { LanServerService, makeLanServerLayer } from "./services/LanServerService";
import { BackupServiceLive } from "./services/BackupService";
import { BackupCoordinator } from "./services/BackupCoordinator";
import { BackupScheduler } from "./services/BackupScheduler";
import { applyRestorePending } from "./services/restorePending";
import { makeAutoUpdateService, type AutoUpdateServiceApi } from "./services/AutoUpdateService";
import {
  checkPostUpdateDatabase,
  markPostUpdateValidationSucceeded,
} from "./services/postUpdateValidation";
import { runPendingMigrations, LATEST_MIGRATION_VERSION } from "./infrastructure/migrations";
import { configureSqlitePragmas } from "./infrastructure/sqlite-pragmas";
import {
  readSchemaVersionSafe,
  backupBeforeMigrate,
  findLatestPreUpdateBackup,
  restorePreUpdateBackup,
  writeRollbackMarker,
  clearRollbackMarker,
  isBlockedByRollback,
  prunePreUpdateBackups,
  applySchemaSql,
  StartupMigrationError,
} from "./services/migrationSafety";
import { registerIpcHandlers } from "./ipc";
import Database from "better-sqlite3";
import fs from "fs";

/** Mutable ref so the QR generator closure always reads the latest LAN URL. */
export interface LanState {
  primaryUrl: string;
}

/** Show a blocking error dialog and terminate. Used for unrecoverable startup
 *  conditions (corruption, downgrade, failed pre-migration backup) where opening
 *  the app could lose or damage data. */
function fatalStartup(title: string, message: string): never {
  dialog.showErrorBox(title, message);
  app.exit(1);
  throw new Error(message); // app.exit ends the process; throw satisfies `never`.
}

/**
 * A database upgrade failed. Offer to restore the verified pre-update backup and
 * restart (user-confirmed, never silent), then halt. Disposes the runtime first
 * (if any) to release file locks. Writes a rollback marker so the next boot does
 * not retry the same failed upgrade. Under smoke-test, never blocks on a dialog.
 */
async function offerRollback(
  dbPath: string,
  reason: string,
  opts: { isSmokeTest: boolean; disposeRuntime?: () => Promise<void> },
): Promise<void> {
  const backupDir = findLatestPreUpdateBackup(dbPath);

  if (opts.isSmokeTest) {
    await opts.disposeRuntime?.().catch(() => {});
    app.exit(1);
    return;
  }

  if (!backupDir) {
    await opts.disposeRuntime?.().catch(() => {});
    fatalStartup(
      "OpenInventory — Update Validation Failed",
      `${reason}\n\nNo automatic backup was found. Please restore from a backup before continuing.`,
    );
    return;
  }

  const choice = await dialog.showMessageBox({
    type: "error",
    buttons: ["Restore and Restart", "Quit"],
    defaultId: 0,
    cancelId: 1,
    title: "OpenInventory — Update Failed",
    message: "The update could not be completed safely.",
    detail:
      `${reason}\n\n` +
      "A verified backup from just before the update is available. Restore it and " +
      "restart to return to your previous working state?",
  });

  // Release DB/file locks before swapping files on disk.
  await opts.disposeRuntime?.().catch(() => {});

  if (choice.response !== 0) {
    app.exit(1);
    return;
  }

  try {
    restorePreUpdateBackup(dbPath, backupDir);
    // Mark this app build + restored data state so the next boot halts instead of
    // re-attempting (and re-failing) the same upgrade. A newer build, or this build
    // against a different data state, is not blocked.
    const restored = new Database(dbPath, { readonly: true });
    let restoredVersion = 0;
    try {
      restoredVersion = readSchemaVersionSafe(restored);
    } finally {
      restored.close();
    }
    writeRollbackMarker(dbPath, {
      appVersion: app.getVersion(),
      schemaVersion: restoredVersion,
      at: new Date().toISOString(),
    });
    app.relaunch();
    app.exit(0);
  } catch (error) {
    fatalStartup(
      "OpenInventory — Restore Failed",
      `Could not restore the backup automatically: ${error instanceof Error ? error.message : String(error)}\n\n` +
        "Please restore from a backup manually.",
    );
  }
}

function resolveDbPath(): string {
  const dataDir = join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return join(dataDir, "inventory-monitor.db");
}

async function initializeDatabase(
  dbPath: string,
  opts: { dbPreExisted: boolean },
): Promise<{ restored: boolean }> {
  const db = new Database(dbPath);
  configureSqlitePragmas(db);

  // Quick integrity check (single page, <50ms)
  const integrityResult = db.prepare("PRAGMA integrity_check(1)").get() as { integrity_check: string };
  if (integrityResult.integrity_check !== "ok") {
    db.close();
    fatalStartup(
      "OpenInventory — Database Corruption Detected",
      "The database file appears to be corrupted. Please restore from a backup.\n\n" +
        `Details: ${integrityResult.integrity_check}`,
    );
  }

  // Downgrade guard: refuse to open data last written by a NEWER app version.
  // Forward-only migrations cannot understand a future schema and could corrupt it.
  const schemaVersion = readSchemaVersionSafe(db);
  if (schemaVersion > LATEST_MIGRATION_VERSION) {
    db.close();
    fatalStartup(
      "OpenInventory — Newer Database Detected",
      "This data was created by a newer version of OpenInventory. " +
        "Install the latest version to continue.\n\n" +
        `(database schema v${schemaVersion}, this app supports v${LATEST_MIGRATION_VERSION})`,
    );
  }

  // Rollback loop guard: if a previous boot rolled back THIS exact upgrade, do not
  // retry it — that would migrate, fail, and offer the same backup again forever.
  if (isBlockedByRollback(dbPath, app.getVersion(), schemaVersion)) {
    db.close();
    fatalStartup(
      "OpenInventory — Previous Update Failed",
      "A recent update could not be completed and your data was restored to its " +
        "earlier version. To protect that data, OpenInventory will not retry the " +
        "same upgrade automatically.\n\n" +
        "Please contact support, or install an update that resolves the issue.",
    );
  }

  // Pre-migration safety backup: take a verified rollback point before ANY schema
  // change, but only for a pre-existing database that is behind. Fail closed if it
  // cannot be created — never migrate without a rollback point. Fresh installs have
  // nothing to lose and skip this.
  if (opts.dbPreExisted && schemaVersion < LATEST_MIGRATION_VERSION) {
    try {
      const backupDir = await backupBeforeMigrate(
        db,
        dbPath,
        schemaVersion,
        LATEST_MIGRATION_VERSION,
      );
      console.log(`[Migrate] verified pre-migration backup created at ${backupDir}`);
    } catch (error) {
      db.close();
      fatalStartup(
        "OpenInventory — Update Halted",
        "OpenInventory could not create a verified backup before upgrading its " +
          "database, so the upgrade was stopped to protect your data.\n\n" +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Apply the latest schema then the migration chain. Both are wrapped: on failure
  // the DB connection is closed (so the rollback can rename the file on Windows) and
  // a typed StartupMigrationError is thrown, which the startup catch routes to the
  // rollback offer. Fatal conditions above exit instead and never reach here.
  try {
    const schemaPath = join(__dirname, "infrastructure/schema.sql");
    if (fs.existsSync(schemaPath)) {
      applySchemaSql(db, fs.readFileSync(schemaPath, "utf-8"));
    }
    runPendingMigrations(db);
  } catch (error) {
    db.close();
    throw new StartupMigrationError(
      error instanceof Error ? error.message : String(error),
    );
  }
  // Migrations completed (or there were none) — any prior rollback marker is resolved.
  clearRollbackMarker(dbPath);

  // Apply .restore-pending.json if present (post-restore startup)
  const result = applyRestorePending(
    dbPath,
    (key: string, value: string) => {
      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(key, value);
    },
  );
  if (result.restored) {
    // Restore detected — settings have been preserved from the pre-restore snapshot.
  }

  db.close();
  return { restored: result.restored };
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove default menu
  mainWindow.setMenu(null);

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    dialog.showErrorBox(
      "OpenInventory — Renderer Crash",
      `The UI process exited before the window became visible (${details.reason}).`,
    );
    app.exit(1);
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ─── Single-instance lock ────────────────────────────────────────────────────
// Prevents double-launch on Windows (DB lock contention + LAN port conflict).
// Must be called before app.whenReady().
app.setAppUserModelId("com.openinventory.app");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Detected up front: the rollback offer must never block on a dialog under
    // smoke-test (CI), and the first failure point precedes normal smoke handling.
    const isSmokeTest = process.argv.includes("--smoke-test");

    const dbPath = resolveDbPath();
    // Capture existence BEFORE opening — `new Database()` creates the file, so this
    // is the only point that can distinguish a fresh install from an upgrade.
    const dbPreExisted = fs.existsSync(dbPath);
    try {
      await initializeDatabase(dbPath, { dbPreExisted });
    } catch (error) {
      // Only a migration/schema failure (StartupMigrationError) is rollback-eligible
      // — a verified pre-migration backup exists. Fatal conditions (corruption,
      // downgrade, blocked rollback, backup failure) already exited via fatalStartup
      // and must NEVER reach the rollback offer, which could restore older data.
      if (error instanceof StartupMigrationError) {
        await offerRollback(
          dbPath,
          `The database upgrade did not complete: ${error.message}`,
          { isSmokeTest },
        );
        return;
      }
      throw error;
    }
    const appVersion = app.getVersion();
    const postUpdateCheck = checkPostUpdateDatabase(dbPath, appVersion);
    if (postUpdateCheck.errors.length > 0) {
      await offerRollback(
        dbPath,
        `Post-update validation failed:\n${postUpdateCheck.errors.join("\n")}`,
        { isSmokeTest },
      );
      return;
    }

    // Boot is healthy past validation — prune old pre-update backups (disk hygiene).
    // Non-fatal: a prune failure must never block startup.
    try {
      const removed = prunePreUpdateBackups(dbPath);
      if (removed.length > 0) {
        console.log(`[Migrate] pruned ${removed.length} old pre-update backup(s)`);
      }
    } catch (error) {
      console.warn("[Migrate] pruning pre-update backups failed (non-fatal):", error);
    }

    // Mutable ref — the QR generator closure reads this on every snapshot load.
    const lanState: LanState = { primaryUrl: "" };

    // QR code generator: returns the public LAN URL for each item, or "" when
    // the LAN server is off. The field is named qrCodeDataUrl for historical
    // reasons but now contains a plain URL (rendered to a QR image on the frontend).
    // QR codes link to the SPA issue route, not the API endpoint.
    // The frontend reads /issue/:itemId from the URL and renders QuickIssuePage.
    const qrCodeGenerator = (itemId: string): string =>
      lanState.primaryUrl
        ? `${lanState.primaryUrl}/issue/${itemId}`
        : "";

    // In production, renderer assets are unpacked from the asar so the LAN
    // server can serve them via fs.readFileSync to external HTTP clients.
    // In dev, use the build output directory (electron-vite builds to out/).
    const rendererDir = is.dev
      ? join(__dirname, "../renderer")
      : join(__dirname, "../renderer").replace("app.asar", "app.asar.unpacked");
    // rendererDir resolved for LAN server static file serving.

    // Merged layer: DB (scoped) + Notifications + LAN server (scoped, depends on DB) + Backup
    // IMPORTANT: reuse the same DbLayer reference so Effect memoizes a single connection.
    const DbLayer = makeDatabaseLayer(dbPath, qrCodeGenerator);
    const DbAndNotifications = Layer.merge(DbLayer, NotificationServiceLive);
    const LanLayer = makeLanServerLayer(rendererDir).pipe(Layer.provide(DbLayer));
    const CoreLayer = Layer.merge(DbAndNotifications, LanLayer);
    const AppLayer = Layer.merge(CoreLayer, BackupServiceLive);

    // Local alias keeps full generic type for callers inside whenReady();
    // the module-level `managedRuntime` is for shutdown handlers only.
    const runtime = ManagedRuntime.make(AppLayer);
    managedRuntime = runtime;

    if (postUpdateCheck.required) {
      try {
        await runtime.runPromise(
          Effect.flatMap(DatabaseService, (s) => s.loadSnapshot()),
        );
        markPostUpdateValidationSucceeded(dbPath, appVersion);
      } catch (error) {
        // The runtime holds the DB connection — pass its dispose so locks are
        // released before any file swap.
        await offerRollback(
          dbPath,
          `The core inventory data could not be loaded after the update: ${error instanceof Error ? error.message : String(error)}`,
          { isSmokeTest, disposeRuntime: () => runtime.dispose() },
        );
        return;
      }
    }

    // Auto-start LAN server if previously enabled; populate lanState.
    if (!isSmokeTest) {
      try {
        const state = await runtime.runPromise(
          Effect.flatMap(LanServerService, (s) => s.loadState()),
        );
        if (state.status === "running" && state.urls.length > 0) {
          lanState.primaryUrl = state.urls[0];
        }
      } catch {
        // Non-fatal — app works without LAN server.
      }
    }

    // ─── Backup coordinator + scheduler ─────────────────────────────────
    backupCoordinator = new BackupCoordinator(runtime, dbPath);

    const autoUpdateService: AutoUpdateServiceApi = makeAutoUpdateService(
      (status) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("auto-update-status", status);
          }
        }
      },
      {
        prepareInstall: (version) =>
          backupCoordinator!.prepareForUpdateInstall(version),
      },
    );

    backupScheduler = new BackupScheduler(
      backupCoordinator,
      async () => {
        const snapshot = await runtime.runPromise(
          Effect.flatMap(DatabaseService, (s) => s.loadSnapshot()),
        );
        return {
          intervalValue: snapshot.backupPlan.schedule.intervalValue,
          intervalUnit: snapshot.backupPlan.schedule.intervalUnit,
          onStartup: snapshot.backupPlan.schedule.onStartup,
          lastSuccessful: snapshot.backupPlan.lastSuccessfulBackup,
        };
      },
    );

    registerIpcHandlers(runtime, lanState, autoUpdateService, backupCoordinator);

    createWindow();

    // ─── Smoke test: verify DB exists, then exit ───────────────────────
    if (isSmokeTest) {
      const dbExists = fs.existsSync(join(app.getPath("userData"), "data", "inventory-monitor.db"));
      // Smoke test: exit 0 if DB initialised successfully, 1 otherwise.
      app.exit(dbExists ? 0 : 1);
      return;
    }

    // Check for updates shortly after launch (non-blocking).
    setTimeout(() => autoUpdateService.checkForUpdates(), 3000);

    // Start backup scheduler (non-blocking).
    if (!isSmokeTest) {
      backupScheduler.start().catch((e) => {
        console.error("[BackupScheduler] Failed to start:", e);
      });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // ─── Graceful shutdown ─────────────────────────────────────────────
    // Await in-flight backup (up to 5 s), stop scheduler, dispose runtime.
    // Idempotent: the module-level `disposed` flag prevents double-execution
    // across before-quit, will-quit, and session-end hooks.
    const gracefulShutdown = async (): Promise<void> => {
      if (disposed) return;
      disposed = true;
      backupScheduler?.stop();
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      await Promise.race([
        backupCoordinator?.awaitPendingBackup()
          .then(() => managedRuntime?.dispose())
          .catch(() => {}),
        timeout,
      ]);
    };

    // before-quit: prevent default, run async shutdown, then re-trigger quit.
    app.on("before-quit", (event) => {
      if (!disposed) {
        event.preventDefault();
        void gracefulShutdown().finally(() => app.quit());
      }
    });

    // will-quit: belt-and-suspenders — if before-quit was skipped, flush here.
    app.on("will-quit", (event) => {
      if (!disposed) {
        event.preventDefault();
        void gracefulShutdown().finally(() => app.quit());
      }
    });

    // session-end: fires on Windows shutdown, restart, or logout
    // (before-quit is NOT emitted in those scenarios).
    app.on("session-end", () => {
      void gracefulShutdown();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
