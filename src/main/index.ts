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
import { runPendingMigrations } from "./infrastructure/migrations";
import { configureSqlitePragmas } from "./infrastructure/sqlite-pragmas";
import { registerIpcHandlers } from "./ipc";
import Database from "better-sqlite3";
import fs from "fs";

/** Mutable ref so the QR generator closure always reads the latest LAN URL. */
export interface LanState {
  primaryUrl: string;
}

function resolveDbPath(): string {
  const dataDir = join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return join(dataDir, "inventory-monitor.db");
}

function initializeDatabase(dbPath: string): { restored: boolean } {
  const db = new Database(dbPath);
  configureSqlitePragmas(db);

  // Quick integrity check (single page, <50ms)
  const integrityResult = db.prepare("PRAGMA integrity_check(1)").get() as { integrity_check: string };
  if (integrityResult.integrity_check !== "ok") {
    db.close();
    dialog.showErrorBox(
      "OpenInventory — Database Corruption Detected",
      "The database file appears to be corrupted. Please restore from a backup.\n\n" +
      `Details: ${integrityResult.integrity_check}`,
    );
    app.exit(1);
  }

  const schemaPath = join(__dirname, "infrastructure/schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf-8"));
  }

  runPendingMigrations(db);

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
    const dbPath = resolveDbPath();
    initializeDatabase(dbPath);

    // ─── Smoke test mode ───────────────────────────────────────────────
    // Launched by CI to verify the packaged app starts and initializes.
    const isSmokeTest = process.argv.includes("--smoke-test");

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

    const autoUpdateService: AutoUpdateServiceApi = makeAutoUpdateService((status) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send("auto-update-status", status);
        }
      }
    });

    // ─── Backup coordinator + scheduler ─────────────────────────────────
    backupCoordinator = new BackupCoordinator(runtime, dbPath);

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
