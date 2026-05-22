import type {
  AddPersonnelInput,
  AppSnapshot,
  AuditAnalyticsResult,
  AuditMovementFilters,
  AuditPageResult,
  BatchIssueMaterialInput,
  CreateInventoryItemInput,
  InventoryMovement,
  Language,
  LanAccessState,
  QrLabelExportPayload,
  UpdateBackupPlanInput,
  UpdateStatus,
  StockMutationInput,
  UpdateInventoryItemInput,
  UpdateLanAccessInput,
} from "../domain/models";
import { detectRuntime } from "../app/runtime";

const LANGUAGE_STORAGE_KEY = "inventory-monitor.language";
const LAN_ACCESS_KEY_STORAGE_KEY = "inventory-monitor.lan-access-key";

type TransportMessageValues = Record<string, string | number>;

interface GatewayErrorInit {
  message?: string;
  status?: number;
  errorTag?: string;
  messageId?: string;
  messageValues?: TransportMessageValues;
  debugMessage?: string;
}

export class GatewayError extends Error {
  status?: number;
  errorTag?: string;
  messageId?: string;
  messageValues?: TransportMessageValues;
  debugMessage?: string;

  constructor(messageOrInit: string | GatewayErrorInit, status?: number, errorTag?: string) {
    const init = typeof messageOrInit === "string"
      ? { message: messageOrInit, status, errorTag }
      : messageOrInit;

    super(init.debugMessage ?? init.message ?? init.messageId ?? "Gateway error");
    this.name = "GatewayError";
    this.status = init.status;
    this.errorTag = init.errorTag;
    this.messageId = init.messageId;
    this.messageValues = init.messageValues;
    this.debugMessage = init.debugMessage;
  }
}

function isLanguage(value: string | null | undefined): value is Language {
  return value === "en" || value === "zh-CN";
}

function getDesktopInvoke() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.electronAPI?.invoke;
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof GatewayError && error.status === 401;
}

export function readPersistedLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  try {
    const storedValue = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(storedValue) ? storedValue : "en";
  } catch {
    return "en";
  }
}

export function readPersistedLanAccessKey(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(LAN_ACCESS_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function persistLanAccessKey(accessKey: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LAN_ACCESS_KEY_STORAGE_KEY, accessKey);
  } catch {
    // Ignore storage errors in browser mode.
  }
}

export function clearLanAccessKey(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(LAN_ACCESS_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage errors in browser mode.
  }
}

function persistLanguageLocally(language: Language): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage write failures and keep the in-memory value instead.
    }
  }
}

async function fetchJson<T>(path: string, init?: RequestInit, includeAccessKey = true): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (includeAccessKey) {
    const accessKey = readPersistedLanAccessKey().trim();
    if (accessKey) {
      headers.set("x-inventory-key", accessKey);
    }
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    let errorTag: string | undefined;
    let messageId: string | undefined;
    let messageValues: TransportMessageValues | undefined;
    let debugMessage: string | undefined;
    try {
      const errorBody = (await response.json()) as {
        message?: string;
        _tag?: string;
        messageId?: string;
        messageValues?: TransportMessageValues;
        debugMessage?: string;
      };
      if (typeof errorBody.message === "string" && errorBody.message.trim()) {
        message = errorBody.message;
      }
      if (typeof errorBody.messageId === "string" && errorBody.messageId.trim()) {
        messageId = errorBody.messageId;
      }
      if (errorBody.messageValues && typeof errorBody.messageValues === "object") {
        messageValues = errorBody.messageValues;
      }
      if (typeof errorBody.debugMessage === "string" && errorBody.debugMessage.trim()) {
        debugMessage = errorBody.debugMessage;
      }
      if (typeof errorBody._tag === "string") {
        errorTag = errorBody._tag;
      }
    } catch {
      // Ignore JSON parse errors and keep the default message.
    }
    throw new GatewayError({
      message,
      status: response.status,
      errorTag,
      messageId,
      messageValues,
      debugMessage,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function supportsHttpApi(): boolean {
  return typeof window !== "undefined" && detectRuntime() === "http";
}

function unsupportedRuntimeError(action: string): GatewayError {
  return new GatewayError({ messageId: "unsupportedRuntime", messageValues: { action }, debugMessage: `${action} requires the desktop app or LAN HTTP access.` });
}

interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    _tag: string;
    messageId: string;
    messageValues?: TransportMessageValues;
    debugMessage?: string;
  };
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const desktopInvoke = getDesktopInvoke();
  if (!desktopInvoke) {
    throw unsupportedRuntimeError("This action");
  }
  try {
    const channel = command.replace(/_/g, "-");
    const result = await desktopInvoke<IpcResult<T>>(channel, args);

    // Unwrap the result envelope returned by the main process.
    if (result && typeof result === "object" && "ok" in result) {
      if (result.ok) {
        return result.data as T;
      }
      throw new GatewayError({
        messageId: result.error?.messageId,
        messageValues: result.error?.messageValues,
        debugMessage: result.error?.debugMessage ?? "Unknown error",
        errorTag: result.error?._tag,
      });
    }

    // Backward compat: if the handler doesn't return an envelope (e.g. auto-update),
    // treat the raw value as the data.
    return result as unknown as T;
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError({ debugMessage: typeof error === "string" ? error : String(error), messageId: "serverError" });
  }
}

export async function loadAppSnapshot(): Promise<AppSnapshot> {
  if (detectRuntime() === "desktop") {
    const snapshot = await invokeCommand<AppSnapshot>("load_app_snapshot");
    persistLanguageLocally(snapshot.language);
    return snapshot;
  }

  if (supportsHttpApi()) {
    const snapshot = await fetchJson<AppSnapshot>("/api/snapshot", { method: "GET" });
    persistLanguageLocally(snapshot.language);
    return snapshot;
  }

  throw unsupportedRuntimeError("Loading the inventory workspace");
}

export async function loadLanAccessState(): Promise<LanAccessState> {
  if (detectRuntime() !== "desktop") {
    throw new GatewayError({ messageId: "lanDesktopOnly", debugMessage: "LAN access can only be managed from the desktop app." });
  }
  return invokeCommand<LanAccessState>("load_lan_access_state");
}

export async function updateLanAccess(input: UpdateLanAccessInput): Promise<LanAccessState> {
  if (detectRuntime() !== "desktop") {
    throw new GatewayError({ messageId: "lanDesktopOnly", debugMessage: "LAN access can only be managed from the desktop app." });
  }
  return invokeCommand<LanAccessState>("update_lan_access", { input });
}

export async function regenerateLanAccessKey(): Promise<LanAccessState> {
  if (detectRuntime() !== "desktop") {
    throw new GatewayError({ messageId: "lanDesktopOnly", debugMessage: "LAN access can only be managed from the desktop app." });
  }
  return invokeCommand<LanAccessState>("regenerate_lan_access_key");
}

export async function createInventoryItem(input: CreateInventoryItemInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("create_inventory_item", { input });
  }
  throw unsupportedRuntimeError("Creating an inventory item");
}

export async function updateInventoryItem(input: UpdateInventoryItemInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(input.itemId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("update_inventory_item", { input });
  }
  throw unsupportedRuntimeError("Updating an inventory item");
}

export async function receiveStock(input: StockMutationInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(input.itemId)}/receive`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("receive_stock", { input });
  }
  throw unsupportedRuntimeError("Receiving stock");
}

export async function issueMaterial(input: StockMutationInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(input.itemId)}/issue`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("issue_material", { input });
  }
  throw unsupportedRuntimeError("Issuing material");
}

export async function batchIssueMaterial(input: BatchIssueMaterialInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/items/batch-issue", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("batch_issue_material", { input });
  }
  throw unsupportedRuntimeError("Issuing materials");
}

export async function updateBackupPlan(input: UpdateBackupPlanInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/backup-plan", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("update_backup_plan", { input });
  }
  throw unsupportedRuntimeError("Updating the backup plan");
}

export async function backupNow(): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/backup-now", {
      method: "POST",
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("backup_now");
  }
  throw unsupportedRuntimeError("Running a backup");
}

// ─── Backup-specific gateway functions (desktop IPC only) ──────────────────

export async function exportQrLabel(label: QrLabelExportPayload): Promise<string | null> {
  if (detectRuntime() !== "desktop") {
    throw unsupportedRuntimeError("Exporting QR labels");
  }

  return invokeCommand<string | null>("export_qr_label", { label });
}

export async function exportSelectedQrLabels(labels: QrLabelExportPayload[]): Promise<string[] | null> {
  if (detectRuntime() !== "desktop") {
    throw unsupportedRuntimeError("Exporting QR labels");
  }

  return invokeCommand<string[] | null>("export_qr_labels", { labels });
}

export async function selectBackupDirectory(): Promise<string | null> {
  if (detectRuntime() !== "desktop") return null;
  return invokeCommand<string | null>("select_backup_directory");
}

export async function selectRestoreSource(): Promise<string | null> {
  if (detectRuntime() !== "desktop") return null;
  return invokeCommand<string | null>("select_restore_source");
}

export async function validateBackup(dirPath: string): Promise<{
  validation: import("../domain/models").BackupValidationResult;
  comparison?: import("../domain/models").RestoreComparisonData;
}> {
  return invokeCommand("validate_backup", { dirPath });
}

export async function restoreFromBackup(dirPath: string): Promise<void> {
  await invokeCommand("restore_from_backup", { dirPath });
}

// ─── Inventory mutations ───────────────────────────────────────────────────

export async function removeInventoryItem(itemId: string): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("remove_inventory_item", { itemId });
  }
  throw unsupportedRuntimeError("Removing an inventory item");
}

export async function getItemMovements(itemId: string): Promise<InventoryMovement[]> {
  if (supportsHttpApi()) {
    return fetchJson<InventoryMovement[]>(`/api/items/${encodeURIComponent(itemId)}/movements`, {
      method: "GET",
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<InventoryMovement[]>("get_item_movements", { itemId });
  }
  throw unsupportedRuntimeError("Loading item movement history");
}

export async function addPersonnel(input: AddPersonnelInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/personnel", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("add_personnel", { input });
  }
  throw unsupportedRuntimeError("Adding personnel");
}

export async function removePersonnel(personnelId: string): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/personnel/${encodeURIComponent(personnelId)}`, {
      method: "DELETE",
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("remove_personnel", { personnelId });
  }
  throw unsupportedRuntimeError("Removing personnel");
}

export async function updateAppLanguage(language: Language): Promise<void> {
  if (detectRuntime() === "desktop") {
    await invokeCommand<void>("update_app_language", { language });
    persistLanguageLocally(language);
    return;
  }

  if (supportsHttpApi()) {
    await fetchJson<void>("/api/language", {
      method: "PUT",
      body: JSON.stringify({ language }),
    });
    persistLanguageLocally(language);
    return;
  }

  throw unsupportedRuntimeError("Updating the app language");
}

// ─── Movement deletion ────────────────────────────────────────────────────────

export async function deleteMovement(movementId: string): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/movements/${encodeURIComponent(movementId)}`, {
      method: "DELETE",
    });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AppSnapshot>("delete_movement", { movementId });
  }
  throw unsupportedRuntimeError("Deleting a movement");
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function getAuditMovements(filters: AuditMovementFilters): Promise<AuditPageResult> {
  if (supportsHttpApi()) {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.movementType) params.set("movementType", filters.movementType);
    if (filters.itemId) params.set("itemId", filters.itemId);
    if (filters.itemSearch) params.set("itemSearch", filters.itemSearch);
    if (filters.performedBy) params.set("performedBy", filters.performedBy);
    if (filters.textSearch) params.set("textSearch", filters.textSearch);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.sortDir) params.set("sortDir", filters.sortDir);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
    return fetchJson<AuditPageResult>(`/api/audit/movements?${params}`, { method: "GET" });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AuditPageResult>("get_audit_movements", { filters });
  }
  throw unsupportedRuntimeError("Loading audit data");
}

export async function getAuditAnalytics(
  filters: Omit<AuditMovementFilters, "page" | "pageSize">,
): Promise<AuditAnalyticsResult> {
  if (supportsHttpApi()) {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.movementType) params.set("movementType", filters.movementType);
    if (filters.itemId) params.set("itemId", filters.itemId);
    if (filters.itemSearch) params.set("itemSearch", filters.itemSearch);
    if (filters.performedBy) params.set("performedBy", filters.performedBy);
    if (filters.textSearch) params.set("textSearch", filters.textSearch);
    return fetchJson<AuditAnalyticsResult>(`/api/audit/analytics?${params}`, { method: "GET" });
  }
  if (detectRuntime() === "desktop") {
    return invokeCommand<AuditAnalyticsResult>("get_audit_analytics", { filters });
  }
  throw unsupportedRuntimeError("Loading audit analytics");
}

// ─── Auto-update ──────────────────────────────────────────────────────────────

export async function checkForUpdates(): Promise<void> {
  if (detectRuntime() !== "desktop") return;
  await invokeCommand<void>("check_for_updates");
}

export async function downloadUpdate(): Promise<void> {
  if (detectRuntime() !== "desktop") return;
  await invokeCommand<void>("download_update");
}

export async function installUpdate(): Promise<void> {
  if (detectRuntime() !== "desktop") return;
  await invokeCommand<void>("install_update");
}

export async function getAppVersion(): Promise<string | null> {
  if (detectRuntime() !== "desktop") return null;
  return invokeCommand<string>("get_app_version");
}

export async function getUpdateStatus(): Promise<UpdateStatus | null> {
  if (detectRuntime() !== "desktop") return null;
  return invokeCommand<UpdateStatus>("get_update_status");
}

export function onAutoUpdateStatus(
  callback: (status: UpdateStatus) => void,
): () => void {
  const api = window.electronAPI;
  if (!api?.on) return () => {};
  return api.on("auto-update-status", (status) => callback(status as UpdateStatus));
}
