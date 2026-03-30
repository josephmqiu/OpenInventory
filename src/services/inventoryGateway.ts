import type {
  AddPersonnelInput,
  AppSnapshot,
  BackupStatus,
  CreateInventoryItemInput,
  InventoryItem,
  Language,
  LanAccessState,
  PersonnelMember,
  PublicIssueContext,
  StockMutationInput,
  StockStatus,
  UpdateBackupPlanInput,
  UpdateInventoryItemInput,
  UpdateLanAccessInput,
} from "../domain/models";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

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
  return window.__TAURI_INTERNALS__?.invoke;
}

export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && typeof getTauriInvoke() === "function";
}

export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && !isDesktopRuntime();
}

function isHttpRuntime(): boolean {
  return isBrowserRuntime() && window.location.protocol.startsWith("http");
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

let browserSnapshot = emptySnapshot();

function persistLanguageLocally(language: Language): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage write failures and keep the in-memory value instead.
    }
  }

  browserSnapshot = {
    ...browserSnapshot,
    language,
  };
}

function emptySnapshot(): AppSnapshot {
  return {
    items: [],
    alerts: [],
    personnel: [],
    backupPlan: {
      targetPath: "",
      targetType: "local_folder",
      schedule: "",
      retention: "",
      lastSuccessfulBackup: "",
      nextScheduledBackup: "",
      status: "warning",
    },
    language: readPersistedLanguage(),
  };
}

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function buildGeneratedSku(): string {
  return `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function normalizeSku(inputSku: string): string {
  const trimmed = inputSku.trim();
  return trimmed.length > 0 ? trimmed : buildGeneratedSku();
}

function computeStockStatus(currentQuantity: number, reorderQuantity: number): StockStatus {
  if (currentQuantity <= 0) {
    return "out_of_stock";
  }
  if (currentQuantity <= reorderQuantity) {
    return "low_stock";
  }
  return "in_stock";
}

function computeBackupStatus(targetPath: string): BackupStatus {
  return targetPath.trim().length > 0 ? "healthy" : "warning";
}

function syncAlerts(item: InventoryItem): void {
  const alert = browserSnapshot.alerts.find(
    (entry) => entry.sku === item.sku && entry.status !== "resolved",
  );

  if (item.currentQuantity <= item.reorderQuantity) {
    if (!alert) {
      browserSnapshot.alerts.unshift({
        id: createId("alert"),
        itemName: item.name,
        sku: item.sku,
        currentQuantity: item.currentQuantity,
        thresholdQuantity: item.reorderQuantity,
        status: "open",
        triggeredAt: nowStamp(),
      });
    } else {
      alert.currentQuantity = item.currentQuantity;
      alert.thresholdQuantity = item.reorderQuantity;
    }
    return;
  }

  if (alert) {
    alert.status = "resolved";
    alert.currentQuantity = item.currentQuantity;
    alert.thresholdQuantity = item.reorderQuantity;
  }
}

function getItemOrThrow(itemId: string): InventoryItem {
  const item = browserSnapshot.items.find((entry) => entry.id === itemId);
  if (!item) {
    throw new Error("Item not found.");
  }
  return item;
}

function applyCreateInventoryItem(input: CreateInventoryItemInput): AppSnapshot {
  const sku = normalizeSku(input.sku);
  if (browserSnapshot.items.some((item) => item.sku.toLowerCase() === sku.toLowerCase())) {
    throw new Error("SKU already exists.");
  }

  const item: InventoryItem = {
    id: createId("item"),
    sku,
    qrCodeDataUrl: "",
    name: input.name.trim(),
    category: input.category.trim(),
    location: input.location.trim(),
    unit: input.unit.trim(),
    supplier: input.supplier.trim(),
    currentQuantity: input.initialQuantity,
    reorderQuantity: input.reorderQuantity,
    status: computeStockStatus(input.initialQuantity, input.reorderQuantity),
    lastUpdated: nowStamp(),
  };

  browserSnapshot = {
    ...browserSnapshot,
    items: [...browserSnapshot.items, item].sort((left, right) => left.name.localeCompare(right.name)),
  };
  syncAlerts(item);
  return browserSnapshot;
}

function applyUpdateInventoryItem(input: UpdateInventoryItemInput): AppSnapshot {
  const item = getItemOrThrow(input.itemId);
  const previousSku = item.sku;
  const nextSku = input.sku.trim() || item.sku;
  const duplicate = browserSnapshot.items.find(
    (entry) => entry.id !== item.id && entry.sku.toLowerCase() === nextSku.toLowerCase(),
  );
  if (duplicate) {
    throw new Error("SKU already exists.");
  }

  item.sku = nextSku;
  item.name = input.name.trim();
  item.category = input.category.trim();
  item.location = input.location.trim();
  item.unit = input.unit.trim();
  item.supplier = input.supplier.trim();
  item.reorderQuantity = input.reorderQuantity;
  item.status = computeStockStatus(item.currentQuantity, item.reorderQuantity);
  item.lastUpdated = nowStamp();

  browserSnapshot.alerts.forEach((alert) => {
    if (alert.sku === previousSku) {
      alert.sku = item.sku;
      alert.itemName = item.name;
    }
  });

  syncAlerts(item);

  browserSnapshot = {
    ...browserSnapshot,
    items: [...browserSnapshot.items].sort((left, right) => left.name.localeCompare(right.name)),
  };
  return browserSnapshot;
}

function applyReceiveStock(input: StockMutationInput): AppSnapshot {
  if (!input.performedBy.trim()) {
    throw new Error("Performed By is required.");
  }

  const item = getItemOrThrow(input.itemId);
  item.currentQuantity += input.quantity;
  item.status = computeStockStatus(item.currentQuantity, item.reorderQuantity);
  item.lastUpdated = nowStamp();
  syncAlerts(item);
  browserSnapshot = { ...browserSnapshot, items: [...browserSnapshot.items] };
  return browserSnapshot;
}

function applyIssueMaterial(input: StockMutationInput): AppSnapshot {
  if (!input.performedBy.trim()) {
    throw new Error("Performed By is required.");
  }

  const item = getItemOrThrow(input.itemId);
  if (input.quantity > item.currentQuantity) {
    throw new Error("Issue quantity exceeds available stock.");
  }
  item.currentQuantity -= input.quantity;
  item.status = computeStockStatus(item.currentQuantity, item.reorderQuantity);
  item.lastUpdated = nowStamp();
  syncAlerts(item);
  browserSnapshot = { ...browserSnapshot, items: [...browserSnapshot.items] };
  return browserSnapshot;
}

function applyUpdateBackupPlan(input: UpdateBackupPlanInput): AppSnapshot {
  const targetPath = input.targetPath.trim();

  browserSnapshot = {
    ...browserSnapshot,
    backupPlan: {
      ...browserSnapshot.backupPlan,
      targetPath,
      targetType: input.targetType,
      schedule: input.schedule.trim(),
      retention: input.retention.trim(),
      status: computeBackupStatus(targetPath),
    },
  };

  return browserSnapshot;
}

function applyRemoveInventoryItem(itemId: string): AppSnapshot {
  const item = getItemOrThrow(itemId);

  browserSnapshot = {
    ...browserSnapshot,
    items: browserSnapshot.items.filter((entry) => entry.id !== itemId),
    alerts: browserSnapshot.alerts.filter((alert) => alert.sku !== item.sku),
  };

  return browserSnapshot;
}

function applyAddPersonnel(input: AddPersonnelInput): AppSnapshot {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Personnel name is required.");
  }
  if (browserSnapshot.personnel.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("Personnel name already exists.");
  }

  const member: PersonnelMember = {
    id: createId("person"),
    name,
  };

  browserSnapshot = {
    ...browserSnapshot,
    personnel: [...browserSnapshot.personnel, member].sort((left, right) => left.name.localeCompare(right.name)),
  };

  return browserSnapshot;
}

function applyRemovePersonnel(personnelId: string): AppSnapshot {
  browserSnapshot = {
    ...browserSnapshot,
    personnel: browserSnapshot.personnel.filter((member) => member.id !== personnelId),
  };

  return browserSnapshot;
}

async function invokeOrFallback<T>(command: string, args: Record<string, unknown>, fallback: () => T): Promise<T> {
  const tauriInvoke = getTauriInvoke();
  if (!tauriInvoke) {
    return fallback();
  }
  return tauriInvoke<T>(command, args);
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
  return isHttpRuntime();
}

export async function loadAppSnapshot(): Promise<AppSnapshot> {
  const tauriInvoke = getTauriInvoke();

  if (tauriInvoke) {
    const snapshot = await tauriInvoke<AppSnapshot>("load_app_snapshot");
    persistLanguageLocally(snapshot.language);
    return snapshot;
  }

  if (supportsHttpApi()) {
    const snapshot = await fetchJson<AppSnapshot>("/api/snapshot", { method: "GET" });
    persistLanguageLocally(snapshot.language);
    return snapshot;
  }

  return {
    ...browserSnapshot,
    language: readPersistedLanguage(),
  };
}

export async function loadPublicIssueContext(itemId: string): Promise<PublicIssueContext> {
  if (!supportsHttpApi()) {
    throw new GatewayError("Public issue pages are only available through LAN browser access.");
  }

  return fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(itemId)}/context`, { method: "GET" }, false);
}

export async function loadLanAccessState(): Promise<LanAccessState> {
  const tauriInvoke = getTauriInvoke();
  if (!tauriInvoke) {
    throw new GatewayError("LAN access can only be managed from the desktop app.");
  }
  return tauriInvoke<LanAccessState>("load_lan_access_state");
}

export async function updateLanAccess(input: UpdateLanAccessInput): Promise<LanAccessState> {
  const tauriInvoke = getTauriInvoke();
  if (!tauriInvoke) {
    throw new GatewayError("LAN access can only be managed from the desktop app.");
  }
  return tauriInvoke<LanAccessState>("update_lan_access", { input });
}

export async function regenerateLanAccessKey(): Promise<LanAccessState> {
  const tauriInvoke = getTauriInvoke();
  if (!tauriInvoke) {
    throw new GatewayError("LAN access can only be managed from the desktop app.");
  }
  return tauriInvoke<LanAccessState>("regenerate_lan_access_key");
}

export async function createInventoryItem(input: CreateInventoryItemInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  return invokeOrFallback("create_inventory_item", { input }, () => applyCreateInventoryItem(input));
}

export async function updateInventoryItem(input: UpdateInventoryItemInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(input.itemId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
  return invokeOrFallback("update_inventory_item", { input }, () => applyUpdateInventoryItem(input));
}

export async function receiveStock(input: StockMutationInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(input.itemId)}/receive`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  return invokeOrFallback("receive_stock", { input }, () => applyReceiveStock(input));
}

export async function issueMaterial(input: StockMutationInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(input.itemId)}/issue`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  return invokeOrFallback("issue_material", { input }, () => applyIssueMaterial(input));
}

export async function issueMaterialPublic(input: StockMutationInput): Promise<PublicIssueContext> {
  if (!supportsHttpApi()) {
    throw new GatewayError("Public issue pages are only available through LAN browser access.");
  }

  return fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(input.itemId)}/issue`, {
    method: "POST",
    body: JSON.stringify(input),
  }, false);
}

export async function updateBackupPlan(input: UpdateBackupPlanInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/backup-plan", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
  return invokeOrFallback("update_backup_plan", { input }, () => applyUpdateBackupPlan(input));
}

export async function removeInventoryItem(itemId: string): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
  }
  return invokeOrFallback("remove_inventory_item", { itemId }, () => applyRemoveInventoryItem(itemId));
}

export async function addPersonnel(input: AddPersonnelInput): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>("/api/personnel", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  return invokeOrFallback("add_personnel", { input }, () => applyAddPersonnel(input));
}

export async function removePersonnel(personnelId: string): Promise<AppSnapshot> {
  if (supportsHttpApi()) {
    return fetchJson<AppSnapshot>(`/api/personnel/${encodeURIComponent(personnelId)}`, {
      method: "DELETE",
    });
  }
  return invokeOrFallback("remove_personnel", { personnelId }, () => applyRemovePersonnel(personnelId));
}

export async function updateAppLanguage(language: Language): Promise<void> {
  persistLanguageLocally(language);

  const tauriInvoke = getTauriInvoke();
  if (tauriInvoke) {
    await tauriInvoke<void>("update_app_language", { language });
    return;
  }

  if (supportsHttpApi()) {
    await fetchJson<void>("/api/language", {
      method: "PUT",
      body: JSON.stringify({ language }),
    });
  }
}


