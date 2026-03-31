import type {
  AddPersonnelInput,
  AppSnapshot,
  CreateInventoryItemInput,
  Language,
  LanAccessState,
  PublicIssueContext,
  UpdateBackupPlanInput,
  StockMutationInput,
  UpdateInventoryItemInput,
  UpdateLanAccessInput,
} from "../domain/models";
import { detectRuntime } from "../app/runtime";

const LANGUAGE_STORAGE_KEY = "inventory-monitor.language";
const LAN_ACCESS_KEY_STORAGE_KEY = "inventory-monitor.lan-access-key";

export class GatewayError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

function isLanguage(value: string | null | undefined): value is Language {
  return value === "en" || value === "zh-CN";
}

function getTauriInvoke() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__TAURI_INTERNALS__?.invoke;
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
    try {
      const errorBody = (await response.json()) as { message?: string };
      if (typeof errorBody.message === "string" && errorBody.message.trim()) {
        message = errorBody.message;
      }
    } catch {
      // Ignore JSON parse errors and keep the default message.
    }
    throw new GatewayError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function supportsHttpApi(): boolean {
  return detectRuntime() === "http";
}

function unsupportedRuntimeError(action: string): GatewayError {
  return new GatewayError(`${action} requires the desktop app or LAN HTTP access.`);
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauriInvoke = getTauriInvoke();
  if (!tauriInvoke) {
    throw unsupportedRuntimeError("This action");
  }
  return tauriInvoke<T>(command, args);
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

export async function loadPublicIssueContext(itemId: string): Promise<PublicIssueContext> {
  if (!supportsHttpApi()) {
    throw new GatewayError("Public issue pages are only available through LAN browser access.");
  }

  return fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(itemId)}/context`, { method: "GET" }, false);
}

export async function loadLanAccessState(): Promise<LanAccessState> {
  if (detectRuntime() !== "desktop") {
    throw new GatewayError("LAN access can only be managed from the desktop app.");
  }
  return invokeCommand<LanAccessState>("load_lan_access_state");
}

export async function updateLanAccess(input: UpdateLanAccessInput): Promise<LanAccessState> {
  if (detectRuntime() !== "desktop") {
    throw new GatewayError("LAN access can only be managed from the desktop app.");
  }
  return invokeCommand<LanAccessState>("update_lan_access", { input });
}

export async function regenerateLanAccessKey(): Promise<LanAccessState> {
  if (detectRuntime() !== "desktop") {
    throw new GatewayError("LAN access can only be managed from the desktop app.");
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

export async function issueMaterialPublic(input: StockMutationInput): Promise<PublicIssueContext> {
  if (!supportsHttpApi()) {
    throw new GatewayError("Public issue pages are only available through LAN browser access.");
  }

  return fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(input.itemId)}/issue`, {
    method: "POST",
    body: JSON.stringify(input),
  });
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
