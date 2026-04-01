import { app, BrowserWindow, dialog, shell } from "electron";
import { join } from "path";
import { Effect, Layer, Runtime } from "effect";
import { is } from "@electron-toolkit/utils";

// Surface fatal startup errors instead of silently exiting.
process.on("uncaughtException", (err) => {
  dialog.showErrorBox("OpenInventory — Fatal Error", err.stack ?? err.message);
  app.exit(1);
});

import { DatabaseService, makeDatabaseLayer } from "./services/DatabaseService";
import { NotificationService, NotificationServiceLive } from "./services/NotificationService";
import { makeLanServerService, type LanServerServiceApi } from "./services/LanServerService";
import { makeAutoUpdateService, type AutoUpdateServiceApi } from "./services/AutoUpdateService";
import { runPendingMigrations } from "./infrastructure/migrations";
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

function initializeDatabase(dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const schemaPath = join(__dirname, "infrastructure/schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf-8"));
  }

  runPendingMigrations(db);
  db.close();
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
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

app.whenReady().then(async () => {
  const dbPath = resolveDbPath();
  initializeDatabase(dbPath);

  // Mutable ref — the QR generator closure reads this on every snapshot load.
  const lanState: LanState = { primaryUrl: "" };

  // QR code generator: returns the public LAN URL for each item, or "" when
  // the LAN server is off. The field is named qrCodeDataUrl for historical
  // reasons but now contains a plain URL (rendered to a QR image on the frontend).
  // QR codes link to the SPA issue route, not the API endpoint.
  // The frontend reads /issue/:itemId from the URL and renders QuickIssuePage.
  const qrCodeGenerator = (itemId: string, _sku: string): string =>
    lanState.primaryUrl
      ? `${lanState.primaryUrl}/issue/${itemId}`
      : "";

  const AppLayer = Layer.merge(
    makeDatabaseLayer(dbPath, qrCodeGenerator),
    NotificationServiceLive,
  );

  const runtime = await Effect.runPromise(
    Layer.toRuntime(AppLayer).pipe(Effect.scoped),
  ) as Runtime.Runtime<DatabaseService | NotificationService>;

  // Extract the concrete DatabaseServiceApi to hand to LanServerService.
  const dbServiceApi = await Runtime.runPromise(runtime)(
    Effect.map(DatabaseService, (s) => s),
  );

  // In production, renderer assets are unpacked from the asar so the LAN
  // server can serve them via fs.readFileSync to external HTTP clients.
  // In dev, use the build output directory (electron-vite builds to out/).
  const rendererDir = is.dev
    ? join(__dirname, "../renderer")
    : join(__dirname, "../renderer").replace("app.asar", "app.asar.unpacked");
  console.log(`[LAN] rendererDir=${rendererDir}, exists=${fs.existsSync(rendererDir)}`);
  const lanService: LanServerServiceApi = makeLanServerService(dbServiceApi, rendererDir);

  // Auto-start LAN server if previously enabled; populate lanState.
  try {
    const state = await Effect.runPromise(lanService.loadState());
    if (state.status === "running" && state.urls.length > 0) {
      lanState.primaryUrl = state.urls[0];
    }
  } catch {
    // Non-fatal — app works without LAN server.
  }

  const autoUpdateService: AutoUpdateServiceApi = makeAutoUpdateService((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("auto-update-status", status);
      }
    }
  });

  registerIpcHandlers(runtime, lanService, lanState, autoUpdateService);

  createWindow();

  // Check for updates shortly after launch (non-blocking).
  setTimeout(() => autoUpdateService.checkForUpdates(), 3000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
