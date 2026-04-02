import { Effect, Context, Layer } from "effect";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import {
  NotFoundError,
  DuplicateSkuError,
  InsufficientStockError,
  ValidationError,
  DatabaseError,
  backendMessages,
  normalizeBackendLanguage,
  type AppError,
} from "../domain/errors";
import { configureSqlitePragmas } from "../infrastructure/sqlite-pragmas";

// ─── Shared Types (imported from single source of truth) ────────────────────

import type {
  AddPersonnelInput,
  AlertFrequencyRow,
  AppSnapshot,
  AuditAnalyticsResult,
  AuditMovementFilters,
  AuditMovementRow,
  AuditPageResult,
  AuditSummary,
  BackupPlan,
  BatchIssueMaterialInput,
  CreateInventoryItemInput,
  InventoryAlert,
  InventoryItem,
  InventoryMovement,
  ItemActivityRow,
  PersonnelActivityRow,
  PersonnelMember,
  StockMutationInput,
  UpdateBackupPlanInput,
  UpdateInventoryItemInput,
} from "../../shared/types";

export type {
  AddPersonnelInput,
  AlertFrequencyRow,
  AppSnapshot,
  AuditAnalyticsResult,
  AuditMovementFilters,
  AuditMovementRow,
  AuditPageResult,
  AuditSummary,
  BackupPlan,
  BatchIssueMaterialInput,
  CreateInventoryItemInput,
  InventoryAlert,
  InventoryItem,
  InventoryMovement,
  ItemActivityRow,
  PersonnelActivityRow,
  PersonnelMember,
  StockMutationInput,
  UpdateBackupPlanInput,
  UpdateInventoryItemInput,
} from "../../shared/types";

// ─── Backend-Only Types ─────────────────────────────────────────────────────

export interface LowStockNotification {
  itemName: string;
  sku: string;
  currentQuantity: number;
  thresholdQuantity: number;
}

export interface MutationResult {
  snapshot: AppSnapshot;
  lowStockNotification: LowStockNotification | null;
}

export interface LanAccessSettings {
  enabled: boolean;
  port: number;
  accessKey: string;
  primaryUrl: string;
}

// ─── ID Generation ───────────────────────────────────────────────────────────

let idCounter = 1;

function generateId(prefix: string): string {
  const stamp = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const sequence = idCounter++;
  return `${prefix}-${stamp}-${sequence}`;
}

function generateSku(): string {
  const stamp = Date.now();
  const sequence = idCounter++;
  return `SKU-${stamp}-${sequence}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stockStatusKey(currentQuantity: number, reorderQuantity: number): import("../../shared/types").StockStatus {
  if (currentQuantity <= 0) return "out_of_stock";
  if (currentQuantity <= reorderQuantity) return "low_stock";
  return "in_stock";
}

function currentLanguage(db: Database.Database): "en" | "zh-CN" {
  return normalizeBackendLanguage(readSetting(db, "app.language"));
}

function requireText(value: string, errorMessage: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ValidationError({ message: errorMessage });
  }
  return trimmed;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function backupStatusKey(targetPath: string): string {
  return targetPath.trim() === "" ? "warning" : "healthy";
}

/**
 * Validate a backup target path: must be absolute and writable.
 * Throws ValidationError with a localized message on failure.
 */
function validateBackupPath(
  targetPath: string,
  messages: ReturnType<typeof backendMessages>,
): void {
  if (targetPath === "") return; // empty is allowed (clears the path)
  if (!path.isAbsolute(targetPath)) {
    throw new ValidationError({ message: messages.backupTargetPathNotAbsolute });
  }
  const resolved = path.resolve(path.normalize(targetPath));
  // Probe write access: create a temp file, then delete it.
  try {
    fs.mkdirSync(resolved, { recursive: true });
    const probe = path.join(resolved, `.oi-write-probe-${Date.now()}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
  } catch {
    throw new ValidationError({ message: messages.backupTargetPathNotWritable });
  }
}

/** Detect if a path is inside a known cloud sync folder. */
function detectCloudProvider(targetPath: string): string {
  if (!targetPath) return "";
  const normalized = targetPath.replace(/\\/g, "/").toLowerCase();
  const home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/").toLowerCase();

  // macOS: ~/Library/CloudStorage/<Provider>-*
  if (normalized.includes("/library/cloudstorage/dropbox")) return "Dropbox";
  if (normalized.includes("/library/cloudstorage/onedrive")) return "OneDrive";
  if (normalized.includes("/library/cloudstorage/googledrive")) return "Google Drive";
  if (normalized.includes("/library/cloudstorage/icloud")) return "iCloud";

  // Windows / cross-platform: ~/Dropbox, ~/OneDrive, ~/Google Drive
  if (home) {
    const rel = normalized.startsWith(home) ? normalized.slice(home.length) : "";
    if (rel.startsWith("/dropbox")) return "Dropbox";
    if (rel.startsWith("/onedrive")) return "OneDrive";
    if (rel.startsWith("/google drive")) return "Google Drive";
  }

  return "";
}

function localizedDatabaseError(db: Database.Database): DatabaseError {
  return new DatabaseError({ message: backendMessages(currentLanguage(db)).databaseError });
}

// ─── Service Interface ───────────────────────────────────────────────────────

export interface DatabaseServiceApi {
  readonly loadSnapshot: () => Effect.Effect<AppSnapshot, AppError>;
  readonly createInventoryItem: (
    input: CreateInventoryItemInput,
  ) => Effect.Effect<MutationResult, AppError>;
  readonly updateInventoryItem: (
    input: UpdateInventoryItemInput,
  ) => Effect.Effect<MutationResult, AppError>;
  readonly receiveStock: (
    input: StockMutationInput,
  ) => Effect.Effect<MutationResult, AppError>;
  readonly issueMaterial: (
    input: StockMutationInput,
  ) => Effect.Effect<MutationResult, AppError>;
  readonly batchIssueMaterial: (
    input: BatchIssueMaterialInput,
  ) => Effect.Effect<MutationResult, AppError>;
  readonly getItemMovements: (
    itemId: string,
  ) => Effect.Effect<InventoryMovement[], AppError>;
  readonly updateBackupPlan: (
    input: UpdateBackupPlanInput,
  ) => Effect.Effect<AppSnapshot, AppError>;
  readonly backupNow: () => Effect.Effect<AppSnapshot, AppError>;
  readonly updateLanguage: (
    language: string,
  ) => Effect.Effect<void, AppError>;
  readonly removeInventoryItem: (
    itemId: string,
  ) => Effect.Effect<AppSnapshot, AppError>;
  readonly addPersonnel: (
    input: AddPersonnelInput,
  ) => Effect.Effect<AppSnapshot, AppError>;
  readonly removePersonnel: (
    personnelId: string,
  ) => Effect.Effect<AppSnapshot, AppError>;
  readonly loadLanAccessSettings: () => Effect.Effect<LanAccessSettings, AppError>;
  readonly saveLanAccessSettings: (
    settings: LanAccessSettings,
  ) => Effect.Effect<void, AppError>;
  readonly getAuditMovements: (
    filters: AuditMovementFilters,
  ) => Effect.Effect<AuditPageResult, AppError>;
  readonly getAuditAnalytics: (
    filters: Omit<AuditMovementFilters, "page" | "pageSize">,
  ) => Effect.Effect<AuditAnalyticsResult, AppError>;
  /** Close the underlying database connection. */
  readonly close: () => void;
}

export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  DatabaseServiceApi
>() {}

// ─── Implementation ──────────────────────────────────────────────────────────

interface ItemRecord {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  currentQuantity: number;
  reorderQuantity: number;
}

function readSetting(
  db: Database.Database,
  key: string,
): string | undefined {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

function writeSetting(
  db: Database.Database,
  key: string,
  value: string,
): void {
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function getItemRecord(
  db: Database.Database,
  itemId: string,
  messages = backendMessages(currentLanguage(db)),
): ItemRecord {
  const row = db
    .prepare(
      "SELECT id, sku, name, barcode, current_quantity, reorder_quantity FROM inventory_items WHERE id = ?",
    )
    .get(itemId) as
    | {
        id: string;
        sku: string;
        name: string;
        barcode: string | null;
        current_quantity: number;
        reorder_quantity: number;
      }
    | undefined;

  if (!row) {
    throw new NotFoundError({ message: messages.itemNotFound });
  }

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    barcode: row.barcode,
    currentQuantity: row.current_quantity,
    reorderQuantity: row.reorder_quantity,
  };
}

function ensureSupplier(
  db: Database.Database,
  supplierName: string,
): string | null {
  if (supplierName === "") return null;

  const existing = db
    .prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?)")
    .get(supplierName) as { id: string } | undefined;

  if (existing) return existing.id;

  const supplierId = generateId("supplier");
  db.prepare(
    "INSERT INTO suppliers (id, name, created_at, updated_at) VALUES (?, ?, datetime('now','localtime'), datetime('now','localtime'))",
  ).run(supplierId, supplierName);
  return supplierId;
}

function ensureLocation(
  db: Database.Database,
  locationName: string,
): string | null {
  if (locationName === "") return null;

  const existing = db
    .prepare("SELECT id FROM locations WHERE lower(name) = lower(?)")
    .get(locationName) as { id: string } | undefined;

  if (existing) return existing.id;

  const locationId = generateId("location");
  const locationCode = generateId("LOC").toUpperCase();
  db.prepare(
    "INSERT INTO locations (id, name, code, created_at, updated_at) VALUES (?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))",
  ).run(locationId, locationName, locationCode);
  return locationId;
}

function resolveSku(
  db: Database.Database,
  requestedSku: string,
  messages = backendMessages(currentLanguage(db)),
): string {
  if (requestedSku !== "") {
    const existing = db
      .prepare(
        "SELECT id FROM inventory_items WHERE lower(sku) = lower(?)",
      )
      .get(requestedSku) as { id: string } | undefined;
    if (existing) {
      throw new DuplicateSkuError({ message: messages.skuAlreadyExists });
    }
    return requestedSku;
  }

  // Auto-generate
  for (;;) {
    const candidate = generateSku();
    const existing = db
      .prepare("SELECT id FROM inventory_items WHERE sku = ?")
      .get(candidate) as { id: string } | undefined;
    if (!existing) return candidate;
  }
}

function resolveUpdatedSku(
  db: Database.Database,
  itemId: string,
  requestedSku: string,
  currentSku: string,
  messages = backendMessages(currentLanguage(db)),
): string {
  const candidate = requestedSku === "" ? currentSku : requestedSku;

  const existing = db
    .prepare(
      "SELECT id FROM inventory_items WHERE lower(sku) = lower(?) AND id <> ?",
    )
    .get(candidate, itemId) as { id: string } | undefined;

  if (existing) {
    throw new DuplicateSkuError({ message: messages.skuAlreadyExists });
  }

  return candidate;
}

function insertMovement(
  db: Database.Database,
  itemId: string,
  movementType: string,
  quantity: number,
  previousQuantity: number,
  newQuantity: number,
  reason: string | null,
  performedBy: string | null,
): void {
  db.prepare(
    `INSERT INTO inventory_movements
     (id, item_id, movement_type, quantity, previous_quantity,
      new_quantity, reason, reference_no, notes, performed_by, performed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, datetime('now','localtime'))`,
  ).run(
    generateId("move"),
    itemId,
    movementType,
    quantity,
    previousQuantity,
    newQuantity,
    reason,
    performedBy,
  );
}

function syncLowStockAlert(
  db: Database.Database,
  itemId: string,
  reorderQuantity: number,
  currentQuantity: number,
): boolean {
  const existing = db
    .prepare(
      "SELECT id FROM low_stock_alerts WHERE item_id = ? AND status = 'open' ORDER BY triggered_at DESC LIMIT 1",
    )
    .get(itemId) as { id: string } | undefined;

  if (currentQuantity <= reorderQuantity) {
    if (!existing) {
      db.prepare(
        `INSERT INTO low_stock_alerts
         (id, item_id, threshold_quantity, quantity_at_trigger,
          status, triggered_at, channel_summary)
         VALUES (?, ?, ?, ?, 'open', datetime('now','localtime'), 'desktop,in_app')`,
      ).run(generateId("alert"), itemId, reorderQuantity, currentQuantity);
      return true;
    }
  } else if (existing) {
    db.prepare(
      "UPDATE low_stock_alerts SET status = 'resolved', resolved_at = datetime('now','localtime') WHERE id = ?",
    ).run(existing.id);
  }

  return false;
}

// ─── Layer Factory ───────────────────────────────────────────────────────────

export function makeDatabaseService(
  dbPath: string,
  qrCodeGenerator?: (itemId: string, sku: string) => string,
): DatabaseServiceApi {
  // Ensure directories
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  // Init DB
  const db = new Database(dbPath);
  configureSqlitePragmas(db);

  // Generate QR data URL (or empty string if no generator)
  const qrDataUrl = qrCodeGenerator ?? (() => "");

  function loadSnapshotSync(): AppSnapshot {
    const items = db
      .prepare(
        `SELECT i.id, i.sku, i.name, i.category,
                COALESCE(l.name, '') AS location,
                i.unit_of_measure, COALESCE(s.name, '') AS supplier,
                i.current_quantity, i.reorder_quantity, i.status, i.updated_at
         FROM inventory_items i
         LEFT JOIN locations l ON l.id = i.location_id
         LEFT JOIN suppliers s ON s.id = i.supplier_id
         ORDER BY i.name`,
      )
      .all() as Array<{
      id: string;
      sku: string;
      name: string;
      category: string;
      location: string;
      unit_of_measure: string;
      supplier: string;
      current_quantity: number;
      reorder_quantity: number;
      status: string;
      updated_at: string;
    }>;

    const mappedItems: InventoryItem[] = items.map((row) => ({
      id: row.id,
      sku: row.sku,
      qrCodeDataUrl: qrDataUrl(row.id, row.sku),
      name: row.name,
      category: row.category,
      location: row.location,
      unit: row.unit_of_measure,
      supplier: row.supplier,
      currentQuantity: row.current_quantity,
      reorderQuantity: row.reorder_quantity,
      status: stockStatusKey(row.current_quantity, row.reorder_quantity),
      lastUpdated: row.updated_at,
    }));

    const alerts = db
      .prepare(
        `SELECT a.id, i.name, i.sku, i.current_quantity,
                a.threshold_quantity, a.status, a.triggered_at
         FROM low_stock_alerts a
         INNER JOIN inventory_items i ON i.id = a.item_id
         ORDER BY a.triggered_at DESC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      sku: string;
      current_quantity: number;
      threshold_quantity: number;
      status: string;
      triggered_at: string;
    }>;

    const mappedAlerts: InventoryAlert[] = alerts.map((row) => ({
      id: row.id,
      itemName: row.name,
      sku: row.sku,
      currentQuantity: row.current_quantity,
      thresholdQuantity: row.threshold_quantity,
      status: row.status === "resolved" ? "resolved" : "open",
      triggeredAt: row.triggered_at,
    }));

    const personnel = db
      .prepare("SELECT id, name FROM personnel ORDER BY name")
      .all() as Array<{ id: string; name: string }>;

    const targetPath = readSetting(db, "backup.target_path") ?? "";
    const intervalValue = parseInt(readSetting(db, "backup.interval_value") ?? "0", 10) || 0;
    const rawUnit = readSetting(db, "backup.interval_unit") ?? "hours";
    const intervalUnit = (rawUnit === "days" || rawUnit === "weeks" ? rawUnit : "hours") as import("../../shared/types").BackupIntervalUnit;
    const onStartup = readSetting(db, "backup.on_startup") === "true";
    const lastSuccessful = readSetting(db, "backup.last_successful") ?? "";
    const lastFileSize = parseInt(readSetting(db, "backup.last_file_size") ?? "0", 10) || 0;
    const lastVerified = readSetting(db, "backup.last_verified") === "true";
    const lastError = readSetting(db, "backup.last_error") ?? "";
    const bkStatus = readSetting(db, "backup.status") ?? "warning";
    const cloudProvider = readSetting(db, "backup.cloud_provider") ?? "";
    const language = normalizeBackendLanguage(readSetting(db, "app.language"));

    const validStatuses = ["healthy", "warning", "error", "backing_up"] as const;
    const status = validStatuses.includes(bkStatus as typeof validStatuses[number])
      ? (bkStatus as import("../../shared/types").BackupStatus)
      : "warning";

    return {
      items: mappedItems,
      alerts: mappedAlerts,
      personnel,
      backupPlan: {
        targetPath,
        schedule: { intervalValue, intervalUnit, onStartup },
        lastSuccessfulBackup: lastSuccessful,
        lastFileSize,
        lastVerified,
        lastError,
        status,
        cloudProvider,
      },
      language,
    };
  }

  return {
    loadSnapshot: () =>
      Effect.try({
        try: () => loadSnapshotSync(),
        catch: () => localizedDatabaseError(db),
      }),

    createInventoryItem: (input) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          const requestedSku = input.sku.trim();
          const name = requireText(input.name, messages.requiredField(messages.itemName));
          const category = requireText(input.category, messages.requiredField(messages.category));
          const unit = requireText(input.unit, messages.requiredField(messages.unit));
          const location = requireText(input.location, messages.requiredField(messages.location));
          const supplier = input.supplier.trim();

          if (input.reorderQuantity < 0 || input.initialQuantity < 0) {
            throw new ValidationError({
              message: messages.quantityValuesMustBeZeroOrGreater,
            });
          }

          const createFn = db.transaction(() => {
            const sku = resolveSku(db, requestedSku, messages);
            const supplierId = ensureSupplier(db, supplier);
            const locationId = ensureLocation(db, location);
            const itemId = generateId("item");
            const status = stockStatusKey(input.initialQuantity, input.reorderQuantity);

            db.prepare(
              `INSERT INTO inventory_items
               (id, sku, barcode, name, category, location_id, supplier_id,
                unit_of_measure, reorder_quantity, current_quantity, status,
                created_at, updated_at)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
            ).run(
              itemId, sku, name, category, locationId, supplierId,
              unit, input.reorderQuantity, input.initialQuantity, status,
            );

            if (input.initialQuantity > 0) {
              insertMovement(
                db, itemId, "receive", input.initialQuantity,
                0, input.initialQuantity, "Initial quantity", null,
              );
            }

            const alertCreated = syncLowStockAlert(
              db, itemId, input.reorderQuantity, input.initialQuantity,
            );

            return {
              alertCreated,
              itemName: name,
              sku,
              currentQuantity: input.initialQuantity,
              reorderQuantity: input.reorderQuantity,
            };
          });

          const result = createFn();
          const snapshot = loadSnapshotSync();

          return {
            snapshot,
            lowStockNotification: result.alertCreated
              ? {
                  itemName: result.itemName,
                  sku: result.sku,
                  currentQuantity: result.currentQuantity,
                  thresholdQuantity: result.reorderQuantity,
                }
              : null,
          };
        },
        catch: (e) => {
          if (
            e instanceof ValidationError ||
            e instanceof DuplicateSkuError ||
            e instanceof NotFoundError ||
            e instanceof InsufficientStockError
          )
            return e;
          return localizedDatabaseError(db);
        },
      }),

    updateInventoryItem: (input) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          const name = requireText(input.name, messages.requiredField(messages.itemName));
          const category = requireText(input.category, messages.requiredField(messages.category));
          const unit = requireText(input.unit, messages.requiredField(messages.unit));
          const location = requireText(input.location, messages.requiredField(messages.location));
          const supplier = input.supplier.trim();

          if (input.reorderQuantity < 0) {
            throw new ValidationError({
              message: messages.reorderLevelMustBeZeroOrGreater,
            });
          }

          const updateFn = db.transaction(() => {
            const item = getItemRecord(db, input.itemId, messages);
            const sku = resolveUpdatedSku(db, input.itemId, input.sku.trim(), item.sku, messages);
            const supplierId = ensureSupplier(db, supplier);
            const locationId = ensureLocation(db, location);
            const status = stockStatusKey(item.currentQuantity, input.reorderQuantity);

            db.prepare(
              `UPDATE inventory_items
               SET sku = ?, barcode = NULL, name = ?, category = ?,
                   location_id = ?, supplier_id = ?, unit_of_measure = ?,
                   reorder_quantity = ?, status = ?,
                   updated_at = datetime('now','localtime')
               WHERE id = ?`,
            ).run(
              sku, name, category, locationId, supplierId,
              unit, input.reorderQuantity, status, input.itemId,
            );

            const alertCreated = syncLowStockAlert(
              db, input.itemId, input.reorderQuantity, item.currentQuantity,
            );

            return {
              alertCreated,
              itemName: name,
              sku,
              currentQuantity: item.currentQuantity,
              reorderQuantity: input.reorderQuantity,
            };
          });

          const result = updateFn();
          const snapshot = loadSnapshotSync();

          return {
            snapshot,
            lowStockNotification: result.alertCreated
              ? {
                  itemName: result.itemName,
                  sku: result.sku,
                  currentQuantity: result.currentQuantity,
                  thresholdQuantity: result.reorderQuantity,
                }
              : null,
          };
        },
        catch: (e) => {
          if (
            e instanceof ValidationError ||
            e instanceof DuplicateSkuError ||
            e instanceof NotFoundError
          )
            return e;
          return localizedDatabaseError(db);
        },
      }),

    receiveStock: (input) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          if (input.quantity <= 0) {
            throw new ValidationError({
              message: messages.receiveQuantityMustBeGreaterThanZero,
            });
          }
          const performedBy = requireText(input.performedBy, messages.requiredField(messages.performedBy));

          const receiveFn = db.transaction(() => {
            const item = getItemRecord(db, input.itemId, messages);
            const newQuantity = item.currentQuantity + input.quantity;
            const status = stockStatusKey(newQuantity, item.reorderQuantity);

            db.prepare(
              "UPDATE inventory_items SET current_quantity = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            ).run(newQuantity, status, item.id);

            insertMovement(
              db, item.id, "receive", input.quantity,
              item.currentQuantity, newQuantity,
              optionalText(input.reason), performedBy,
            );

            const alertCreated = syncLowStockAlert(
              db, item.id, item.reorderQuantity, newQuantity,
            );

            return {
              alertCreated,
              itemName: item.name,
              sku: item.sku,
              currentQuantity: newQuantity,
              reorderQuantity: item.reorderQuantity,
            };
          });

          const result = receiveFn();
          const snapshot = loadSnapshotSync();

          return {
            snapshot,
            lowStockNotification: result.alertCreated
              ? {
                  itemName: result.itemName,
                  sku: result.sku,
                  currentQuantity: result.currentQuantity,
                  thresholdQuantity: result.reorderQuantity,
                }
              : null,
          };
        },
        catch: (e) => {
          if (e instanceof ValidationError || e instanceof NotFoundError) return e;
          return localizedDatabaseError(db);
        },
      }),

    issueMaterial: (input) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          if (input.quantity <= 0) {
            throw new ValidationError({
              message: messages.issueQuantityMustBeGreaterThanZero,
            });
          }
          const performedBy = requireText(input.performedBy, messages.requiredField(messages.performedBy));

          const issueFn = db.transaction(() => {
            const item = getItemRecord(db, input.itemId, messages);

            if (input.quantity > item.currentQuantity) {
              throw new InsufficientStockError({
                available: item.currentQuantity,
                requested: input.quantity,
                language: currentLanguage(db),
              });
            }

            const newQuantity = item.currentQuantity - input.quantity;
            const status = stockStatusKey(newQuantity, item.reorderQuantity);

            db.prepare(
              "UPDATE inventory_items SET current_quantity = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            ).run(newQuantity, status, item.id);

            insertMovement(
              db, item.id, "issue", input.quantity,
              item.currentQuantity, newQuantity,
              optionalText(input.reason), performedBy,
            );

            const alertCreated = syncLowStockAlert(
              db, item.id, item.reorderQuantity, newQuantity,
            );

            return {
              alertCreated,
              itemName: item.name,
              sku: item.sku,
              currentQuantity: newQuantity,
              reorderQuantity: item.reorderQuantity,
            };
          });

          const result = issueFn();
          const snapshot = loadSnapshotSync();

          return {
            snapshot,
            lowStockNotification: result.alertCreated
              ? {
                  itemName: result.itemName,
                  sku: result.sku,
                  currentQuantity: result.currentQuantity,
                  thresholdQuantity: result.reorderQuantity,
                }
              : null,
          };
        },
        catch: (e) => {
          if (
            e instanceof ValidationError ||
            e instanceof NotFoundError ||
            e instanceof InsufficientStockError
          )
            return e;
          return localizedDatabaseError(db);
        },
      }),

    batchIssueMaterial: (input) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          if (input.items.length === 0) {
            throw new ValidationError({
              message: messages.batchIssueMustIncludeAtLeastOneItem,
            });
          }
          const performedBy = requireText(input.performedBy, messages.requiredField(messages.performedBy));

          const batchFn = db.transaction(() => {
            let lowStockNotification: LowStockNotification | null = null;

            for (const batchItem of input.items) {
              if (batchItem.quantity <= 0) {
                throw new ValidationError({
                  message: messages.batchIssueQuantityMustBeGreaterThanZero(batchItem.itemId),
                });
              }

              let item: ItemRecord;
              try {
                item = getItemRecord(db, batchItem.itemId, messages);
              } catch (e) {
                if (e instanceof NotFoundError) {
                  throw new ValidationError({
                    message: messages.batchIssueItemNotFound(batchItem.itemId),
                  });
                }
                throw e;
              }

              if (batchItem.quantity > item.currentQuantity) {
                throw new ValidationError({
                  message: messages.batchIssueInsufficientStock(
                    item.name,
                    item.sku,
                    batchItem.quantity,
                    item.currentQuantity,
                  ),
                });
              }

              const newQuantity = item.currentQuantity - batchItem.quantity;
              const status = stockStatusKey(newQuantity, item.reorderQuantity);

              db.prepare(
                "UPDATE inventory_items SET current_quantity = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
              ).run(newQuantity, status, item.id);

              insertMovement(
                db, item.id, "issue", batchItem.quantity,
                item.currentQuantity, newQuantity,
                optionalText(input.reason), performedBy,
              );

              const alertCreated = syncLowStockAlert(
                db, item.id, item.reorderQuantity, newQuantity,
              );

              if (alertCreated) {
                lowStockNotification = {
                  itemName: item.name,
                  sku: item.sku,
                  currentQuantity: newQuantity,
                  thresholdQuantity: item.reorderQuantity,
                };
              }
            }

            return lowStockNotification;
          });

          const notification = batchFn();
          const snapshot = loadSnapshotSync();

          return { snapshot, lowStockNotification: notification };
        },
        catch: (e) => {
          if (e instanceof ValidationError) return e;
          return localizedDatabaseError(db);
        },
      }),

    getItemMovements: (itemId) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          const exists = db
            .prepare("SELECT id FROM inventory_items WHERE id = ?")
            .get(itemId);
          if (!exists) {
            throw new NotFoundError({ message: messages.itemNotFound });
          }

          const rows = db
            .prepare(
              `SELECT id, item_id, movement_type, quantity, performed_by, reason, performed_at
               FROM inventory_movements
               WHERE item_id = ?
               ORDER BY performed_at DESC
               LIMIT 50`,
            )
            .all(itemId) as Array<{
            id: string;
            item_id: string;
            movement_type: string;
            quantity: number;
            performed_by: string | null;
            reason: string | null;
            performed_at: string;
          }>;

          return rows.map((row) => ({
            id: row.id,
            itemId: row.item_id,
            movementType: row.movement_type,
            quantity: row.quantity,
            performedBy: row.performed_by,
            reason: row.reason,
            createdAt: row.performed_at,
          }));
        },
        catch: (e) => {
          if (e instanceof NotFoundError) return e;
          return localizedDatabaseError(db);
        },
      }),

    updateBackupPlan: (input) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          const targetPath = input.targetPath.trim();
          validateBackupPath(targetPath, messages);
          const status = backupStatusKey(targetPath);

          // Detect cloud sync provider from path
          const cloudProvider = detectCloudProvider(targetPath);

          const updateFn = db.transaction(() => {
            writeSetting(db, "backup.target_path", targetPath);
            writeSetting(db, "backup.interval_value", String(input.intervalValue));
            writeSetting(db, "backup.interval_unit", input.intervalUnit);
            writeSetting(db, "backup.on_startup", input.onStartup ? "true" : "false");
            writeSetting(db, "backup.status", status);
            writeSetting(db, "backup.cloud_provider", cloudProvider);
          });
          updateFn();

          return loadSnapshotSync();
        },
        catch: (e) => {
          if (e instanceof ValidationError) return e;
          return localizedDatabaseError(db);
        },
      }),

    backupNow: () =>
      Effect.tryPromise({
        try: async () => {
          const messages = backendMessages(currentLanguage(db));
          const targetPath = (readSetting(db, "backup.target_path") ?? "").trim();
          if (targetPath === "") {
            throw new ValidationError({
              message: messages.backupTargetPathRequired,
            });
          }
          validateBackupPath(targetPath, messages);

          // Directory backup: write to {targetPath}/OpenInventory-Backup/
          const backupDir = path.join(targetPath, "OpenInventory-Backup");
          const tempFile = path.join(backupDir, "database.tmp.db");
          const finalFile = path.join(backupDir, "database.db");
          fs.mkdirSync(backupDir, { recursive: true });

          // Step 1: Backup to temp file
          const source = new Database(dbPath, { readonly: true });
          try {
            await source.backup(tempFile);
          } finally {
            source.close();
          }

          // Step 2: Atomic rename (temp → final)
          fs.renameSync(tempFile, finalFile);

          const fileSize = fs.statSync(finalFile).size;

          // Step 3: Write manifest
          const manifestPath = path.join(backupDir, "manifest.json");
          const manifest = {
            formatVersion: 1,
            appVersion: process.env.npm_package_version || "unknown",
            schemaVersion: 0,
            createdAt: new Date().toISOString(),
            platform: process.platform,
            stats: { items: 0, movements: 0, personnel: 0 },
            checksums: { database: "" },
          };
          let verified = false;
          try {
            // Read stats + verify the backup
            const verifyDb = new Database(finalFile, { readonly: true });
            try {
              verifyDb.pragma("trusted_schema = OFF");
              const integrity = verifyDb.prepare("PRAGMA integrity_check(1)").get() as { integrity_check: string };
              verified = integrity.integrity_check === "ok";
              manifest.schemaVersion = (verifyDb.prepare("SELECT COALESCE(MAX(version), 0) as v FROM schema_migrations").get() as { v: number }).v;
              manifest.stats.items = (verifyDb.prepare("SELECT COUNT(*) as c FROM inventory_items").get() as { c: number }).c;
              manifest.stats.movements = (verifyDb.prepare("SELECT COUNT(*) as c FROM inventory_movements").get() as { c: number }).c;
              manifest.stats.personnel = (verifyDb.prepare("SELECT COUNT(*) as c FROM personnel").get() as { c: number }).c;
            } finally {
              verifyDb.close();
            }
          } catch { /* manifest stats are best-effort, verification status already false */ }
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

          const updateFn = db.transaction(() => {
            writeSetting(db, "backup.last_successful", new Date().toISOString());
            writeSetting(db, "backup.last_file_size", String(fileSize));
            writeSetting(db, "backup.last_verified", verified ? "true" : "false");
            writeSetting(db, "backup.last_error", "");
            writeSetting(db, "backup.status", backupStatusKey(targetPath));
          });
          updateFn();

          return loadSnapshotSync();
        },
        catch: (e) => {
          if (e instanceof ValidationError) return e;
          return localizedDatabaseError(db);
        },
      }),

    updateLanguage: (language) =>
      Effect.try({
        try: () => {
          const key = language === "zh-CN" ? "zh-CN" : "en";
          const updateFn = db.transaction(() => {
            writeSetting(db, "app.language", key);
          });
          updateFn();
        },
        catch: () => localizedDatabaseError(db),
      }),

    removeInventoryItem: (itemId) =>
      Effect.try({
        try: () => {
          const removeFn = db.transaction(() => {
            const item = getItemRecord(db, itemId);
            db.prepare("DELETE FROM low_stock_alerts WHERE item_id = ?").run(item.id);
            db.prepare("DELETE FROM inventory_movements WHERE item_id = ?").run(item.id);
            db.prepare("DELETE FROM inventory_items WHERE id = ?").run(item.id);
          });
          removeFn();

          return loadSnapshotSync();
        },
        catch: (e) => {
          if (e instanceof NotFoundError) return e;
          return localizedDatabaseError(db);
        },
      }),

    addPersonnel: (input) =>
      Effect.try({
        try: () => {
          const messages = backendMessages(currentLanguage(db));
          const name = requireText(input.name, messages.requiredField(messages.personnelName));

          const addFn = db.transaction(() => {
            const existing = db
              .prepare("SELECT id FROM personnel WHERE lower(name) = lower(?)")
              .get(name) as { id: string } | undefined;
            if (existing) {
              throw new ValidationError({
                message: messages.personnelNameAlreadyExists,
              });
            }

            const personnelId = generateId("person");
            db.prepare(
              "INSERT INTO personnel (id, name, created_at, updated_at) VALUES (?, ?, datetime('now','localtime'), datetime('now','localtime'))",
            ).run(personnelId, name);
          });
          addFn();

          return loadSnapshotSync();
        },
        catch: (e) => {
          if (e instanceof ValidationError) return e;
          return localizedDatabaseError(db);
        },
      }),

    removePersonnel: (personnelId) =>
      Effect.try({
        try: () => {
          const result = db
            .prepare("DELETE FROM personnel WHERE id = ?")
            .run(personnelId);
          if (result.changes === 0) {
            throw new NotFoundError({
              message: backendMessages(currentLanguage(db)).personnelNotFound,
            });
          }
          return loadSnapshotSync();
        },
        catch: (e) => {
          if (e instanceof NotFoundError) return e;
          return localizedDatabaseError(db);
        },
      }),

    loadLanAccessSettings: () =>
      Effect.try({
        try: () => {
          const enabled = readSetting(db, "lan.enabled");
          const port = readSetting(db, "lan.port");
          const accessKey = readSetting(db, "lan.access_key");
          const primaryUrl = readSetting(db, "lan.primary_url");

          return {
            enabled: enabled === "true",
            port:
              port !== undefined
                ? (parseInt(port, 10) || 4123)
                : 4123,
            accessKey: accessKey ?? "",
            primaryUrl: primaryUrl ?? "",
          };
        },
        catch: () => localizedDatabaseError(db),
      }),

    saveLanAccessSettings: (settings) =>
      Effect.try({
        try: () => {
          const saveFn = db.transaction(() => {
            writeSetting(db, "lan.enabled", settings.enabled ? "true" : "false");
            writeSetting(db, "lan.port", String(settings.port));
            writeSetting(db, "lan.access_key", settings.accessKey);
            writeSetting(db, "lan.primary_url", settings.primaryUrl);
          });
          saveFn();
        },
        catch: () => localizedDatabaseError(db),
      }),

    getAuditMovements: (filters) =>
      Effect.try({
        try: () => {
          const conditions: string[] = [];
          const params: unknown[] = [];

          if (filters.dateFrom) {
            conditions.push("m.performed_at >= ?");
            params.push(filters.dateFrom.replace("T", " ").replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/, "$1:00"));
          }
          if (filters.dateTo) {
            conditions.push("m.performed_at <= ?");
            params.push(filters.dateTo.replace("T", " ").replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/, "$1:59"));
          }
          if (filters.movementType) {
            conditions.push("m.movement_type = ?");
            params.push(filters.movementType);
          }
          if (filters.itemId) {
            conditions.push("m.item_id = ?");
            params.push(filters.itemId);
          } else if (filters.itemSearch) {
            const escaped = filters.itemSearch.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
            conditions.push("(i.name LIKE '%' || ? || '%' ESCAPE '\\' OR i.sku LIKE '%' || ? || '%' ESCAPE '\\')");
            params.push(escaped, escaped);
          }
          if (filters.performedBy) {
            conditions.push("m.performed_by = ?");
            params.push(filters.performedBy);
          }
          if (filters.textSearch) {
            const escaped = filters.textSearch.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
            conditions.push(
              "(m.reason LIKE '%' || ? || '%' ESCAPE '\\' OR m.reference_no LIKE '%' || ? || '%' ESCAPE '\\' OR m.notes LIKE '%' || ? || '%' ESCAPE '\\' OR m.performed_by LIKE '%' || ? || '%' ESCAPE '\\')",
            );
            params.push(escaped, escaped, escaped, escaped);
          }

          const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

          // Data query with anomaly detection via CTE
          const page = Math.max(1, filters.page);
          const pageSize = Math.min(Math.max(1, filters.pageSize), 10000);
          const offset = (page - 1) * pageSize;

          const dataRows = db
            .prepare(
              `WITH item_avgs AS (
                SELECT item_id, AVG(quantity) AS avg_qty, COUNT(*) AS move_count
                FROM inventory_movements GROUP BY item_id HAVING COUNT(*) >= 5
              )
              SELECT m.id, m.item_id, i.name AS item_name, i.sku AS item_sku,
                m.movement_type, m.quantity, m.previous_quantity, m.new_quantity,
                m.reason, m.reference_no, m.notes, m.performed_by, m.performed_at,
                CASE WHEN a.avg_qty IS NOT NULL AND m.quantity >= a.avg_qty * 5 THEN 1 ELSE 0 END AS is_anomaly
              FROM inventory_movements m
              JOIN inventory_items i ON i.id = m.item_id
              LEFT JOIN item_avgs a ON m.item_id = a.item_id
              ${whereClause}
              ORDER BY m.performed_at DESC
              LIMIT ? OFFSET ?`,
            )
            .all(...params, pageSize, offset) as Array<{
            id: string;
            item_id: string;
            item_name: string;
            item_sku: string;
            movement_type: string;
            quantity: number;
            previous_quantity: number;
            new_quantity: number;
            reason: string | null;
            reference_no: string | null;
            notes: string | null;
            performed_by: string | null;
            performed_at: string;
            is_anomaly: number;
          }>;

          // Count query
          const countRow = db
            .prepare(
              `SELECT COUNT(*) AS total
              FROM inventory_movements m
              JOIN inventory_items i ON i.id = m.item_id
              ${whereClause}`,
            )
            .get(...params) as { total: number };

          // Summary aggregation
          const summaryRow = db
            .prepare(
              `SELECT
                COUNT(*) AS total_movements,
                COALESCE(SUM(CASE WHEN m.movement_type = 'receive' THEN m.quantity ELSE 0 END), 0) AS total_received,
                COALESCE(SUM(CASE WHEN m.movement_type = 'issue' THEN m.quantity ELSE 0 END), 0) AS total_issued,
                COUNT(DISTINCT m.item_id) AS unique_items,
                COUNT(DISTINCT m.performed_by) AS unique_personnel
              FROM inventory_movements m
              JOIN inventory_items i ON i.id = m.item_id
              ${whereClause}`,
            )
            .get(...params) as {
            total_movements: number;
            total_received: number;
            total_issued: number;
            unique_items: number;
            unique_personnel: number;
          };

          const rows: AuditMovementRow[] = dataRows.map((row) => ({
            id: row.id,
            itemId: row.item_id,
            itemName: row.item_name,
            itemSku: row.item_sku,
            movementType: row.movement_type,
            quantity: row.quantity,
            previousQuantity: row.previous_quantity,
            newQuantity: row.new_quantity,
            reason: row.reason,
            referenceNo: row.reference_no,
            notes: row.notes,
            performedBy: row.performed_by,
            performedAt: row.performed_at,
            isAnomaly: row.is_anomaly === 1,
          }));

          return {
            rows,
            total: countRow.total,
            summary: {
              totalMovements: summaryRow.total_movements,
              totalReceived: summaryRow.total_received,
              totalIssued: summaryRow.total_issued,
              uniqueItems: summaryRow.unique_items,
              uniquePersonnel: summaryRow.unique_personnel,
            },
          };
        },
        catch: () => localizedDatabaseError(db),
      }),

    getAuditAnalytics: (filters) =>
      Effect.try({
        try: () => {
          const conditions: string[] = [];
          const params: unknown[] = [];

          if (filters.dateFrom) {
            conditions.push("m.performed_at >= ?");
            params.push(filters.dateFrom.replace("T", " ").replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/, "$1:00"));
          }
          if (filters.dateTo) {
            conditions.push("m.performed_at <= ?");
            params.push(filters.dateTo.replace("T", " ").replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/, "$1:59"));
          }
          if (filters.movementType) {
            conditions.push("m.movement_type = ?");
            params.push(filters.movementType);
          }
          if (filters.itemId) {
            conditions.push("m.item_id = ?");
            params.push(filters.itemId);
          } else if (filters.itemSearch) {
            const escaped = filters.itemSearch.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
            conditions.push("(i.name LIKE '%' || ? || '%' ESCAPE '\\' OR i.sku LIKE '%' || ? || '%' ESCAPE '\\')");
            params.push(escaped, escaped);
          }
          if (filters.performedBy) {
            conditions.push("m.performed_by = ?");
            params.push(filters.performedBy);
          }
          if (filters.textSearch) {
            const escaped = filters.textSearch.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
            conditions.push(
              "(m.reason LIKE '%' || ? || '%' ESCAPE '\\' OR m.reference_no LIKE '%' || ? || '%' ESCAPE '\\' OR m.notes LIKE '%' || ? || '%' ESCAPE '\\' OR m.performed_by LIKE '%' || ? || '%' ESCAPE '\\')",
            );
            params.push(escaped, escaped, escaped, escaped);
          }

          const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

          // Summary
          const summaryRow = db
            .prepare(
              `SELECT
                COUNT(*) AS total_movements,
                COALESCE(SUM(CASE WHEN m.movement_type = 'receive' THEN m.quantity ELSE 0 END), 0) AS total_received,
                COALESCE(SUM(CASE WHEN m.movement_type = 'issue' THEN m.quantity ELSE 0 END), 0) AS total_issued,
                COUNT(DISTINCT m.item_id) AS unique_items,
                COUNT(DISTINCT m.performed_by) AS unique_personnel
              FROM inventory_movements m
              JOIN inventory_items i ON i.id = m.item_id
              ${whereClause}`,
            )
            .get(...params) as {
            total_movements: number;
            total_received: number;
            total_issued: number;
            unique_items: number;
            unique_personnel: number;
          };

          // By Personnel
          const personnelRows = db
            .prepare(
              `SELECT
                COALESCE(m.performed_by, '(not provided)') AS performed_by,
                SUM(CASE WHEN m.movement_type = 'receive' THEN 1 ELSE 0 END) AS receive_count,
                SUM(CASE WHEN m.movement_type = 'issue' THEN 1 ELSE 0 END) AS issue_count,
                SUM(m.quantity) AS total_quantity,
                COUNT(DISTINCT m.item_id) AS distinct_items
              FROM inventory_movements m
              JOIN inventory_items i ON i.id = m.item_id
              ${whereClause}
              GROUP BY COALESCE(m.performed_by, '(not provided)')
              ORDER BY total_quantity DESC`,
            )
            .all(...params) as Array<{
            performed_by: string;
            receive_count: number;
            issue_count: number;
            total_quantity: number;
            distinct_items: number;
          }>;

          // By Item
          const itemRows = db
            .prepare(
              `SELECT
                m.item_id, i.name AS item_name, i.sku AS item_sku,
                SUM(CASE WHEN m.movement_type = 'receive' THEN 1 ELSE 0 END) AS receive_count,
                SUM(CASE WHEN m.movement_type = 'issue' THEN 1 ELSE 0 END) AS issue_count,
                COALESCE(SUM(CASE WHEN m.movement_type = 'receive' THEN m.quantity ELSE 0 END), 0) AS total_received,
                COALESCE(SUM(CASE WHEN m.movement_type = 'issue' THEN m.quantity ELSE 0 END), 0) AS total_issued,
                i.current_quantity
              FROM inventory_movements m
              JOIN inventory_items i ON i.id = m.item_id
              ${whereClause}
              GROUP BY m.item_id, i.name, i.sku, i.current_quantity
              ORDER BY (SUM(CASE WHEN m.movement_type = 'receive' THEN 1 ELSE 0 END) + SUM(CASE WHEN m.movement_type = 'issue' THEN 1 ELSE 0 END)) DESC`,
            )
            .all(...params) as Array<{
            item_id: string;
            item_name: string;
            item_sku: string;
            receive_count: number;
            issue_count: number;
            total_received: number;
            total_issued: number;
            current_quantity: number;
          }>;

          // Alert Frequency (uses date filters only)
          const alertConditions: string[] = [];
          const alertParams: unknown[] = [];
          if (filters.dateFrom) {
            alertConditions.push("a.triggered_at >= ?");
            alertParams.push(filters.dateFrom.replace("T", " ").replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/, "$1:00"));
          }
          if (filters.dateTo) {
            alertConditions.push("a.triggered_at <= ?");
            alertParams.push(filters.dateTo.replace("T", " ").replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/, "$1:59"));
          }
          const alertWhereClause = alertConditions.length > 0 ? "WHERE " + alertConditions.join(" AND ") : "";

          const alertRows = db
            .prepare(
              `SELECT
                a.item_id, i.name AS item_name, i.sku AS item_sku,
                COUNT(*) AS trigger_count,
                MAX(a.triggered_at) AS last_triggered_at,
                CASE WHEN EXISTS (
                  SELECT 1 FROM low_stock_alerts a2
                  WHERE a2.item_id = a.item_id AND a2.status = 'open'
                ) THEN 'open' ELSE 'resolved' END AS current_status,
                i.current_quantity
              FROM low_stock_alerts a
              JOIN inventory_items i ON i.id = a.item_id
              ${alertWhereClause}
              GROUP BY a.item_id, i.name, i.sku, i.current_quantity
              ORDER BY trigger_count DESC`,
            )
            .all(...alertParams) as Array<{
            item_id: string;
            item_name: string;
            item_sku: string;
            trigger_count: number;
            last_triggered_at: string;
            current_status: string;
            current_quantity: number;
          }>;

          return {
            summary: {
              totalMovements: summaryRow.total_movements,
              totalReceived: summaryRow.total_received,
              totalIssued: summaryRow.total_issued,
              uniqueItems: summaryRow.unique_items,
              uniquePersonnel: summaryRow.unique_personnel,
            },
            byPersonnel: personnelRows.map((r) => ({
              performedBy: r.performed_by,
              receiveCount: r.receive_count,
              issueCount: r.issue_count,
              totalQuantity: r.total_quantity,
              distinctItems: r.distinct_items,
            })),
            byItem: itemRows.map((r) => ({
              itemId: r.item_id,
              itemName: r.item_name,
              itemSku: r.item_sku,
              receiveCount: r.receive_count,
              issueCount: r.issue_count,
              totalReceived: r.total_received,
              totalIssued: r.total_issued,
              netChange: r.total_received - r.total_issued,
              currentQuantity: r.current_quantity,
            })),
            alertFrequency: alertRows.map((r) => ({
              itemId: r.item_id,
              itemName: r.item_name,
              itemSku: r.item_sku,
              triggerCount: r.trigger_count,
              lastTriggeredAt: r.last_triggered_at,
              currentStatus: r.current_status,
              currentQuantity: r.current_quantity,
            })),
          };
        },
        catch: () => localizedDatabaseError(db),
      }),

    close: () => db.close(),
  };
}

/** Create a scoped DatabaseService Layer that closes the DB on scope finalization. */
export function makeDatabaseLayer(
  dbPath: string,
  qrCodeGenerator?: (itemId: string, sku: string) => string,
): Layer.Layer<DatabaseService> {
  return Layer.scoped(
    DatabaseService,
    Effect.acquireRelease(
      Effect.sync(() => makeDatabaseService(dbPath, qrCodeGenerator)),
      (service) => Effect.sync(() => service.close()),
    ),
  );
}
