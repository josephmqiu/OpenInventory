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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppSnapshot {
  items: InventoryItem[];
  alerts: InventoryAlert[];
  personnel: PersonnelMember[];
  backupPlan: BackupPlan;
  language: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  qrCodeDataUrl: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  supplier: string;
  currentQuantity: number;
  reorderQuantity: number;
  status: string;
  lastUpdated: string;
}

export interface InventoryAlert {
  id: string;
  itemName: string;
  sku: string;
  currentQuantity: number;
  thresholdQuantity: number;
  status: string;
  triggeredAt: string;
}

export interface PersonnelMember {
  id: string;
  name: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  movementType: string;
  quantity: number;
  performedBy: string | null;
  reason: string | null;
  createdAt: string;
}

export interface BackupPlan {
  targetPath: string;
  targetType: string;
  schedule: string;
  retention: string;
  lastSuccessfulBackup: string;
  nextScheduledBackup: string;
  status: string;
}

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

export interface CreateInventoryItemInput {
  sku: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  supplier: string;
  reorderQuantity: number;
  initialQuantity: number;
}

export interface UpdateInventoryItemInput {
  itemId: string;
  sku: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  supplier: string;
  reorderQuantity: number;
}

export interface StockMutationInput {
  itemId: string;
  quantity: number;
  reason: string;
  performedBy: string;
}

export interface BatchIssueMaterialInput {
  items: { itemId: string; quantity: number }[];
  performedBy: string;
  reason: string;
}

export interface AddPersonnelInput {
  name: string;
}

export interface UpdateBackupPlanInput {
  targetPath: string;
  targetType: string;
  schedule: string;
  retention: string;
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

function stockStatusKey(currentQuantity: number, reorderQuantity: number): string {
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
  db.pragma("foreign_keys = ON");

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
    const targetType = readSetting(db, "backup.target_type") ?? "local_folder";
    const schedule = readSetting(db, "backup.schedule") ?? "";
    const retention = readSetting(db, "backup.retention") ?? "";
    const lastSuccessful = readSetting(db, "backup.last_successful") ?? "";
    const nextScheduled = readSetting(db, "backup.next_scheduled") ?? "";
    const bkStatus = readSetting(db, "backup.status") ?? "warning";
    const language = normalizeBackendLanguage(readSetting(db, "app.language"));

    return {
      items: mappedItems,
      alerts: mappedAlerts,
      personnel,
      backupPlan: {
        targetPath,
        targetType,
        schedule,
        retention,
        lastSuccessfulBackup: lastSuccessful,
        nextScheduledBackup: nextScheduled,
        status: bkStatus === "healthy" ? "healthy" : "warning",
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
          const targetPath = input.targetPath.trim();
          const schedule = input.schedule.trim();
          const retention = input.retention.trim();
          const status = backupStatusKey(targetPath);

          const updateFn = db.transaction(() => {
            writeSetting(db, "backup.target_path", targetPath);
            writeSetting(db, "backup.target_type", input.targetType);
            writeSetting(db, "backup.schedule", schedule);
            writeSetting(db, "backup.retention", retention);
            writeSetting(db, "backup.status", status);
          });
          updateFn();

          return loadSnapshotSync();
        },
        catch: () => localizedDatabaseError(db),
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

          // Create timestamped backup
          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .replace("T", "_")
            .slice(0, 19);
          const backupFile = path.join(
            targetPath,
            `inventory-monitor-${timestamp}.db`,
          );
          fs.mkdirSync(targetPath, { recursive: true });

          // Await the backup so we only mark success after it completes.
          const source = new Database(dbPath, { readonly: true });
          try {
            await source.backup(backupFile);
          } finally {
            source.close();
          }

          const updateFn = db.transaction(() => {
            writeSetting(
              db,
              "backup.last_successful",
              new Date().toISOString(),
            );
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
  };
}

/** Create a DatabaseService Layer from a db file path */
export function makeDatabaseLayer(
  dbPath: string,
  qrCodeGenerator?: (itemId: string, sku: string) => string,
): Layer.Layer<DatabaseService> {
  return Layer.succeed(
    DatabaseService,
    makeDatabaseService(dbPath, qrCodeGenerator),
  );
}
