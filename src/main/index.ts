import { app, BrowserWindow, shell } from "electron";
import { join } from "path";
import { Effect, Layer, Runtime } from "effect";
import { is } from "@electron-toolkit/utils";

import { DatabaseService, makeDatabaseLayer } from "./services/DatabaseService";
import { NotificationService, NotificationServiceLive } from "./services/NotificationService";
import { runPendingMigrations } from "./infrastructure/migrations";
import { registerIpcHandlers } from "./ipc";
import Database from "better-sqlite3";
import fs from "fs";

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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
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

  const AppLayer = Layer.merge(
    makeDatabaseLayer(dbPath),
    NotificationServiceLive,
  );

  // Build a concrete runtime from the layer
  const runtime = await Effect.runPromise(
    Layer.toRuntime(AppLayer).pipe(Effect.scoped),
  ) as Runtime.Runtime<DatabaseService | NotificationService>;

  registerIpcHandlers(runtime);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
