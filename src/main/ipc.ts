import { ipcMain, dialog, BrowserWindow, app } from "electron";
import { Effect, Either, type ManagedRuntime } from "effect";
import { Schema } from "@effect/schema";
import { DatabaseService, type MutationResult } from "./services/DatabaseService";
import { NotificationService } from "./services/NotificationService";
import { LanServerService } from "./services/LanServerService";
import { BackupService } from "./services/BackupService";
import { serializeAppError, type AppError, validationError } from "./domain/errors";
import type { AutoUpdateServiceApi } from "./services/AutoUpdateService";
import type { BackupCoordinator } from "./services/BackupCoordinator";
import type { LanState } from "./index";
import type { IpcResult, TransportError } from "../shared/schemas";
import { normalizeQrLabelFileName } from "../shared/qrLabelExport";
import {
  CreateInventoryItemArgs,
  UpdateInventoryItemArgs,
  StockMutationArgs,
  BatchIssueMaterialArgs,
  UpdateBackupPlanArgs,
  AddPersonnelArgs,
  UpdateLanAccessArgs,
  ExportQrLabelArgs,
  ExportQrLabelsArgs,
  ItemIdArgs,
  PersonnelIdArgs,
  LanguageArgs,
  SaveAppCurrencyArgs,
  AuditMovementFilterArgs,
  AuditAnalyticsFilterArgs,
  DirPathArgs,
} from "../shared/schemas";

import { writeQrLabelFile, writeQrLabelFiles } from "./qrLabelExportStorage";

type AppRuntime = ManagedRuntime.ManagedRuntime<
  DatabaseService | NotificationService | LanServerService | BackupService,
  never
>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: TransportError): IpcResult<never> {
  return { ok: false, error };
}

/** getFocusedWindow() can return null on Windows when the app loses focus.
 *  Fall back to the first available window so dialogs still work. */
function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function decodeOrFail<A, I>(schema: Schema.Schema<A, I>): (input: unknown) => A {
  const decode = Schema.decodeUnknownSync(schema);
  return (input: unknown) => {
    try {
      return decode(input);
    } catch (e) {
      throw validationError("invalidInput", undefined, e instanceof Error ? e.message : "Invalid input.");
    }
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerIpcHandlers(
  runtime: AppRuntime,
  lanState: LanState,
  autoUpdateService: AutoUpdateServiceApi,
  backupCoordinator?: BackupCoordinator,
): void {
  /** Run an Effect through the managed runtime, return a result envelope. */
  async function run<A>(
    effect: Effect.Effect<A, AppError, DatabaseService | NotificationService | LanServerService | BackupService>,
  ): Promise<IpcResult<A>> {
    const result = await runtime.runPromise(
      effect.pipe(Effect.either),
    );
    return Either.isRight(result)
      ? ok(result.right)
      : fail(serializeAppError(result.left));
  }

  /** Shorthand for mutation handlers that check for low-stock notifications. */
  function handleMutation<Args>(
    channel: string,
    schema: Schema.Schema<Args>,
    makeEffect: (args: Args) => Effect.Effect<MutationResult, AppError, DatabaseService>,
  ): void {
    const decode = decodeOrFail(schema);
    ipcMain.handle(channel, async (_event, rawArgs: unknown) => {
      try {
        const args = decode(rawArgs);
        return await run(
          Effect.gen(function* () {
            const ns = yield* NotificationService;
            const result = yield* makeEffect(args);
            if (result.lowStockNotification) {
              yield* ns.sendLowStockAlert(result.lowStockNotification);
            }
            return result.snapshot;
          }),
        );
      } catch (error) {
        return fail(serializeAppError(error));
      }
    });
  }

  // ─── Health ──────────────────────────────────────────────────────────────

  ipcMain.handle("app-health", () =>
    ok({ status: "ready", storage: "sqlite-local" }),
  );

  // ─── Snapshot ────────────────────────────────────────────────────────────

  ipcMain.handle("load-app-snapshot", async () => {
    try {
      return await run(Effect.flatMap(DatabaseService, (s) => s.loadSnapshot()));
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  // ─── Mutations (DRY: decode → service → notify → snapshot) ───────────

  handleMutation("create-inventory-item", CreateInventoryItemArgs, (a) =>
    Effect.flatMap(DatabaseService, (db) => db.createInventoryItem(a.input)),
  );
  handleMutation("update-inventory-item", UpdateInventoryItemArgs, (a) =>
    Effect.flatMap(DatabaseService, (db) => db.updateInventoryItem(a.input)),
  );
  handleMutation("receive-stock", StockMutationArgs, (a) =>
    Effect.flatMap(DatabaseService, (db) => db.receiveStock(a.input)),
  );
  handleMutation("issue-material", StockMutationArgs, (a) =>
    Effect.flatMap(DatabaseService, (db) => db.issueMaterial(a.input)),
  );
  handleMutation("batch-issue-material", BatchIssueMaterialArgs, (a) =>
    Effect.flatMap(DatabaseService, (db) => db.batchIssueMaterial(a.input)),
  );

  // ─── Read-only handlers ──────────────────────────────────────────────────

  ipcMain.handle("get-item-movements", async (_event, rawArgs: unknown) => {
    try {
      const { itemId } = decodeOrFail(ItemIdArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.getItemMovements(itemId)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("get-audit-movements", async (_event, rawArgs: unknown) => {
    try {
      const { filters } = decodeOrFail(AuditMovementFilterArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.getAuditMovements(filters)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("get-audit-analytics", async (_event, rawArgs: unknown) => {
    try {
      const { filters } = decodeOrFail(AuditAnalyticsFilterArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.getAuditAnalytics(filters)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  // ─── Simple write handlers ───────────────────────────────────────────────

  ipcMain.handle("update-backup-plan", async (_event, rawArgs: unknown) => {
    try {
      const { input } = decodeOrFail(UpdateBackupPlanArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.updateBackupPlan(input)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("backup-now", async () => {
    try {
      if (backupCoordinator) {
        const snapshot = await backupCoordinator.backupNow();
        return ok(snapshot);
      }
      return await run(Effect.flatMap(DatabaseService, (s) => s.backupNow()));
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("export-qr-label", async (_event, rawArgs: unknown) => {
    try {
      const { label } = decodeOrFail(ExportQrLabelArgs)(rawArgs);
      const win = getMainWindow();
      if (!win) return ok(null);

      const result = await dialog.showSaveDialog(win, {
        defaultPath: normalizeQrLabelFileName(label.suggestedFileName),
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });

      if (result.canceled || !result.filePath) {
        return ok(null);
      }

      return ok(await writeQrLabelFile(result.filePath, label));
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("export-qr-labels", async (_event, rawArgs: unknown) => {
    try {
      const { labels } = decodeOrFail(ExportQrLabelsArgs)(rawArgs);
      const win = getMainWindow();
      if (!win) return ok(null);

      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory", "createDirectory"],
        title: "Choose Export Folder",
      });

      if (result.canceled || result.filePaths.length === 0) {
        return ok(null);
      }

      return ok(await writeQrLabelFiles(result.filePaths[0], labels));
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("select-backup-directory", async () => {
    try {
      const win = getMainWindow();
      if (!win) return ok(null);
      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory", "createDirectory"],
        title: "Select Backup Destination",
      });
      if (result.canceled || result.filePaths.length === 0) return ok(null);
      return ok(result.filePaths[0]);
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("select-restore-source", async () => {
    try {
      const win = getMainWindow();
      if (!win) return ok(null);
      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
        title: "Select Backup to Restore",
      });
      if (result.canceled || result.filePaths.length === 0) return ok(null);
      return ok(result.filePaths[0]);
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("validate-backup", async (_event, rawArgs: unknown) => {
    try {
      if (!backupCoordinator) {
        return fail({
          _tag: "ValidationError",
          messageId: "backupCoordinatorUnavailable",
          debugMessage: "Backup coordinator not available",
        });
      }
      const { dirPath } = decodeOrFail(DirPathArgs)(rawArgs);
      if (!dirPath) throw validationError("required.dirPath");
      const result = await backupCoordinator.validateBackup(dirPath);
      return ok(result);
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("restore-from-backup", async (_event, rawArgs: unknown) => {
    try {
      if (!backupCoordinator) {
        return fail({
          _tag: "ValidationError",
          messageId: "backupCoordinatorUnavailable",
          debugMessage: "Backup coordinator not available",
        });
      }
      const { dirPath } = decodeOrFail(DirPathArgs)(rawArgs);
      if (!dirPath) throw validationError("required.dirPath");
      await backupCoordinator.restoreFromBackup(dirPath);
      // Won't reach here — app.relaunch() + app.exit() fires during restore
      return ok(null);
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("update-app-language", async (_event, rawArgs: unknown) => {
    try {
      const { language } = decodeOrFail(LanguageArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.updateLanguage(language)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("update-app-currency", async (_event, rawArgs: unknown) => {
    try {
      const { currency } = decodeOrFail(SaveAppCurrencyArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.updateCurrency(currency)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("remove-inventory-item", async (_event, rawArgs: unknown) => {
    try {
      const { itemId } = decodeOrFail(ItemIdArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.removeInventoryItem(itemId)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("add-personnel", async (_event, rawArgs: unknown) => {
    try {
      const { input } = decodeOrFail(AddPersonnelArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.addPersonnel(input)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("remove-personnel", async (_event, rawArgs: unknown) => {
    try {
      const { personnelId } = decodeOrFail(PersonnelIdArgs)(rawArgs);
      return await run(
        Effect.flatMap(DatabaseService, (s) => s.removePersonnel(personnelId)),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  // ─── Movement deletion ───────────────────────────────────────────────────────

  ipcMain.handle("delete-movement", async (_event, rawArgs: unknown) => {
    try {
      const { movementId } = decodeOrFail(Schema.Struct({ movementId: Schema.String }))(rawArgs);
      return await run(
        Effect.gen(function* () {
          const ns = yield* NotificationService;
          const result = yield* DatabaseService.pipe(
            Effect.flatMap((s) => s.deleteMovement(movementId)),
          );
          if (result.lowStockNotification) {
            yield* ns.sendLowStockAlert(result.lowStockNotification);
          }
          return result.snapshot;
        }),
      );
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  // ─── LAN access: delegate to LanServerService ────────────────────────────

  ipcMain.handle("load-lan-access-state", async () => {
    const result = await run(
      Effect.flatMap(LanServerService, (s) => s.loadState()),
    );
    if (result.ok) updateLanState(lanState, result.data);
    return result;
  });

  ipcMain.handle("update-lan-access", async (_event, rawArgs: unknown) => {
    try {
      const { input } = decodeOrFail(UpdateLanAccessArgs)(rawArgs);
      const result = await run(
        Effect.flatMap(LanServerService, (s) => s.updateAccess(input)),
      );
      if (result.ok) updateLanState(lanState, result.data);
      return result;
    } catch (error) {
      return fail(serializeAppError(error));
    }
  });

  ipcMain.handle("regenerate-lan-access-key", async () => {
    const result = await run(
      Effect.flatMap(LanServerService, (s) => s.regenerateAccessKey()),
    );
    if (result.ok) updateLanState(lanState, result.data);
    return result;
  });

  // ─── Auto-update (no envelope — fire-and-forget) ─────────────────────────

  ipcMain.handle("check-for-updates", () => {
    autoUpdateService.checkForUpdates();
  });

  ipcMain.handle("download-update", () => {
    autoUpdateService.downloadUpdate();
  });

  ipcMain.handle("install-update", () => {
    autoUpdateService.installUpdate();
  });

  ipcMain.handle("get-app-version", () => app.getVersion());

  // Lets the renderer recover the current update status on mount (e.g. after a
  // window recreate/reload, or if the startup check completed before it subscribed).
  ipcMain.handle("get-update-status", () => autoUpdateService.getStatus());
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Keep the mutable QR-URL ref in sync with the LAN server state. */
function updateLanState(
  lanState: LanState,
  result: { status: string; urls: string[] },
): void {
  lanState.primaryUrl =
    result.status === "running" && result.urls.length > 0
      ? result.urls[0]
      : "";
}
