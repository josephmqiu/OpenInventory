import { ipcMain } from "electron";
import crypto from "crypto";
import { Effect, Runtime } from "effect";
import { DatabaseService } from "./services/DatabaseService";
import { NotificationService } from "./services/NotificationService";
import { serializeError, type AppError } from "./domain/errors";

type AppRuntime = Runtime.Runtime<DatabaseService | NotificationService>;

export function registerIpcHandlers(runtime: AppRuntime): void {
  const run = <A>(effect: Effect.Effect<A, AppError, DatabaseService | NotificationService>): Promise<A> =>
    Runtime.runPromise(runtime)(effect).catch((error) => {
      throw serializeError(error as AppError);
    });

  ipcMain.handle("app-health", () => ({
    status: "ready",
    storage: "sqlite-local",
  }));

  ipcMain.handle("load-app-snapshot", () =>
    run(Effect.flatMap(DatabaseService, (s) => s.loadSnapshot())),
  );

  ipcMain.handle("create-inventory-item", (_event, args: { input: unknown }) =>
    run(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const ns = yield* NotificationService;
        const result = yield* db.createInventoryItem(args.input as Parameters<typeof db.createInventoryItem>[0]);
        if (result.lowStockNotification) {
          yield* ns.sendLowStockAlert(result.lowStockNotification);
        }
        return result.snapshot;
      }),
    ),
  );

  ipcMain.handle("update-inventory-item", (_event, args: { input: unknown }) =>
    run(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const ns = yield* NotificationService;
        const result = yield* db.updateInventoryItem(args.input as Parameters<typeof db.updateInventoryItem>[0]);
        if (result.lowStockNotification) {
          yield* ns.sendLowStockAlert(result.lowStockNotification);
        }
        return result.snapshot;
      }),
    ),
  );

  ipcMain.handle("receive-stock", (_event, args: { input: unknown }) =>
    run(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const ns = yield* NotificationService;
        const result = yield* db.receiveStock(args.input as Parameters<typeof db.receiveStock>[0]);
        if (result.lowStockNotification) {
          yield* ns.sendLowStockAlert(result.lowStockNotification);
        }
        return result.snapshot;
      }),
    ),
  );

  ipcMain.handle("issue-material", (_event, args: { input: unknown }) =>
    run(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const ns = yield* NotificationService;
        const result = yield* db.issueMaterial(args.input as Parameters<typeof db.issueMaterial>[0]);
        if (result.lowStockNotification) {
          yield* ns.sendLowStockAlert(result.lowStockNotification);
        }
        return result.snapshot;
      }),
    ),
  );

  ipcMain.handle("batch-issue-material", (_event, args: { input: unknown }) =>
    run(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const ns = yield* NotificationService;
        const result = yield* db.batchIssueMaterial(args.input as Parameters<typeof db.batchIssueMaterial>[0]);
        if (result.lowStockNotification) {
          yield* ns.sendLowStockAlert(result.lowStockNotification);
        }
        return result.snapshot;
      }),
    ),
  );

  ipcMain.handle("get-item-movements", (_event, args: { itemId: string }) =>
    run(Effect.flatMap(DatabaseService, (s) => s.getItemMovements(args.itemId))),
  );

  ipcMain.handle("update-backup-plan", (_event, args: { input: unknown }) =>
    run(
      Effect.flatMap(DatabaseService, (s) =>
        s.updateBackupPlan(args.input as Parameters<typeof s.updateBackupPlan>[0]),
      ),
    ),
  );

  ipcMain.handle("backup-now", () =>
    run(Effect.flatMap(DatabaseService, (s) => s.backupNow())),
  );

  ipcMain.handle("update-app-language", (_event, args: { language: string }) =>
    run(Effect.flatMap(DatabaseService, (s) => s.updateLanguage(args.language))),
  );

  ipcMain.handle("remove-inventory-item", (_event, args: { itemId: string }) =>
    run(Effect.flatMap(DatabaseService, (s) => s.removeInventoryItem(args.itemId))),
  );

  ipcMain.handle("add-personnel", (_event, args: { input: unknown }) =>
    run(
      Effect.flatMap(DatabaseService, (s) =>
        s.addPersonnel(args.input as Parameters<typeof s.addPersonnel>[0]),
      ),
    ),
  );

  ipcMain.handle("remove-personnel", (_event, args: { personnelId: string }) =>
    run(Effect.flatMap(DatabaseService, (s) => s.removePersonnel(args.personnelId))),
  );

  // LAN access handlers are registered separately after LanServerService is created
  ipcMain.handle("load-lan-access-state", () =>
    run(Effect.flatMap(DatabaseService, (s) => s.loadLanAccessSettings())),
  );

  ipcMain.handle("update-lan-access", (_event, args: { input: unknown }) =>
    run(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const input = args.input as { enabled: boolean; port: number };
        const current = yield* db.loadLanAccessSettings();
        const updated = { ...current, enabled: input.enabled, port: input.port };
        yield* db.saveLanAccessSettings(updated);
        return yield* db.loadLanAccessSettings();
      }),
    ),
  );

  ipcMain.handle("regenerate-lan-access-key", () =>
    run(
      Effect.gen(function* () {
        const db = yield* DatabaseService;
        const current = yield* db.loadLanAccessSettings();
        const newKey = crypto.randomBytes(18).toString("base64url").slice(0, 24);
        const updated = { ...current, accessKey: newKey };
        yield* db.saveLanAccessSettings(updated);
        return yield* db.loadLanAccessSettings();
      }),
    ),
  );
}
