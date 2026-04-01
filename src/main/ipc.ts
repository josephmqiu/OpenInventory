import { ipcMain } from "electron";
import { Effect, Either, type ManagedRuntime } from "effect";
import { Schema } from "@effect/schema";
import { DatabaseService, type MutationResult } from "./services/DatabaseService";
import { NotificationService } from "./services/NotificationService";
import { LanServerService } from "./services/LanServerService";
import { serializeAppError, ValidationError, type AppError } from "./domain/errors";
import type { AutoUpdateServiceApi } from "./services/AutoUpdateService";
import type { LanState } from "./index";
import type { IpcResult, TransportError } from "../shared/schemas";
import {
  CreateInventoryItemArgs,
  UpdateInventoryItemArgs,
  StockMutationArgs,
  BatchIssueMaterialArgs,
  UpdateBackupPlanArgs,
  AddPersonnelArgs,
  UpdateLanAccessArgs,
  ItemIdArgs,
  PersonnelIdArgs,
  LanguageArgs,
  AuditMovementFilterArgs,
  AuditAnalyticsFilterArgs,
} from "../shared/schemas";

type AppRuntime = ManagedRuntime.ManagedRuntime<
  DatabaseService | NotificationService | LanServerService,
  never
>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: TransportError): IpcResult<never> {
  return { ok: false, error };
}

function decodeOrFail<A, I>(schema: Schema.Schema<A, I>): (input: unknown) => A {
  const decode = Schema.decodeUnknownSync(schema);
  return (input: unknown) => {
    try {
      return decode(input);
    } catch (e) {
      throw new ValidationError({
        message: e instanceof Error ? e.message : "Invalid input.",
      });
    }
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerIpcHandlers(
  runtime: AppRuntime,
  lanState: LanState,
  autoUpdateService: AutoUpdateServiceApi,
): void {
  /** Run an Effect through the managed runtime, return a result envelope. */
  async function run<A>(
    effect: Effect.Effect<A, AppError, DatabaseService | NotificationService | LanServerService>,
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
      return await run(Effect.flatMap(DatabaseService, (s) => s.backupNow()));
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

