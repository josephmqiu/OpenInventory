// ─── Shared Types ───────────────────────────────────────────────────────────
// Single source of truth for types used by both the Electron main process
// (server) and the renderer frontends (desktop + mobile clients).

export type Language = "en" | "zh-CN";

// Allowed app currencies (v1: 2-decimal currencies only, so the stored
// integer-minor-unit exponent is constant and switching currency never
// rescales values). 0/3-decimal currencies (JPY, KRW, BHD) are deferred.
export type CurrencyCode =
  | "CNY"
  | "USD"
  | "EUR"
  | "GBP"
  | "HKD"
  | "AUD"
  | "CAD"
  | "SGD";

export const DEFAULT_CURRENCY: CurrencyCode = "CNY";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type AlertStatus = "open" | "resolved";
export type BackupIntervalUnit = "hours" | "days" | "weeks";
export type BackupStatus = "healthy" | "warning" | "error" | "backing_up";
export type LanAccessStatus = "running" | "stopped" | "error";

export type UpdateStatus =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "available"; version: string; releaseNotes: string }
  | { stage: "not-available"; version: string }
  | { stage: "downloading"; percent: number; transferred: number; total: number }
  | { stage: "downloaded"; version: string }
  | { stage: "error"; message: string };

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
  /** Optional price in integer minor units of the app currency (e.g. fen for
   *  CNY). null = no price set, distinct from 0. */
  unitPriceMinor: number | null;
  status: StockStatus;
  lastUpdated: string;
}

export interface InventoryAlert {
  id: string;
  itemName: string;
  sku: string;
  currentQuantity: number;
  thresholdQuantity: number;
  status: AlertStatus;
  triggeredAt: string;
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

export interface PersonnelMember {
  id: string;
  name: string;
}

export interface BackupSchedule {
  intervalValue: number;
  intervalUnit: BackupIntervalUnit;
  onStartup: boolean;
}

export interface BackupPlan {
  targetPath: string;
  schedule: BackupSchedule;
  lastSuccessfulBackup: string;
  lastFileSize: number;
  lastVerified: boolean;
  lastError: string;
  status: BackupStatus;
  cloudProvider: string;
}

export interface LanAccessState {
  enabled: boolean;
  port: number;
  accessKey: string;
  urls: string[];
  status: LanAccessStatus;
  statusMessage: string;
  ipChanged?: boolean;
}

/** Read-only item view served to anonymous LAN clients (QR scan lookup). */
export interface PublicItemContext {
  item: InventoryItem | null;
  language: Language;
  currency: CurrencyCode;
}

/** A catalog item as exposed to anonymous LAN clients. Omits `qrCodeDataUrl`
 *  (heavy base64 the mobile UI never renders); every other display field is
 *  intentionally public on the trusted LAN (see LAN router). */
export type PublicCatalogItem = Omit<InventoryItem, "qrCodeDataUrl">;

/** Read-only catalog served to anonymous LAN clients so a floor worker who
 *  scanned one QR (or opened the generic lookup URL) can browse/search the
 *  whole inventory without re-scanning. Read-only — the admin remains the sole
 *  mutator of inventory state. */
export interface PublicItemCatalog {
  items: PublicCatalogItem[];
  language: Language;
  currency: CurrencyCode;
}

export interface AppSnapshot {
  items: InventoryItem[];
  alerts: InventoryAlert[];
  personnel: PersonnelMember[];
  backupPlan: BackupPlan;
  language: Language;
  currency: CurrencyCode;
}

export interface DashboardMetrics {
  totalItems: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  openAlertCount: number;
}

export interface QrLabelExportPayload {
  suggestedFileName: string;
  pngDataUrl: string;
}

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateInventoryItemInput {
  sku: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  supplier: string;
  reorderQuantity: number;
  initialQuantity: number;
  /** Optional price in minor units; omitted/undefined = no price. */
  unitPriceMinor?: number | null;
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
  /** null clears the price; undefined leaves it unchanged. */
  unitPriceMinor?: number | null;
}

export interface StockMutationInput {
  itemId: string;
  quantity: number;
  reason: string;
  performedBy: string;
}

export interface BatchIssueItem {
  itemId: string;
  quantity: number;
}

export interface BatchIssueMaterialInput {
  items: readonly BatchIssueItem[];
  performedBy: string;
  reason: string;
}

export interface AddPersonnelInput {
  name: string;
}

export interface UpdateBackupPlanInput {
  targetPath: string;
  intervalValue: number;
  intervalUnit: BackupIntervalUnit;
  onStartup: boolean;
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  manifest?: BackupManifest;
  stats?: { items: number; movements: number; personnel: number };
}

export interface BackupManifest {
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  platform: string;
  stats: { items: number; movements: number; personnel: number };
  checksums: { database: string };
}

export interface RestoreComparisonData {
  backup: {
    createdAt: string;
    items: number;
    movements: number;
    personnel: number;
    schemaVersion: number;
    appVersion: string;
  };
  current: {
    lastActivity: string;
    items: number;
    movements: number;
    personnel: number;
  };
  backupIsNewer: boolean;
}

export interface UpdateLanAccessInput {
  enabled: boolean;
  port: number;
}

export type ActionKind =
  | "createItem"
  | "modifyItem"
  | "receiveStock"
  | "issueMaterial"
  | "removeItem";

// ─── Audit Types ────────────────────────────────────────────────────────────

export interface AuditMovementFilters {
  dateFrom?: string;
  dateTo?: string;
  movementType?: "receive" | "issue";
  itemId?: string;
  itemSearch?: string;
  performedBy?: string;
  textSearch?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface AuditMovementRow {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  movementType: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  referenceNo: string | null;
  notes: string | null;
  performedBy: string | null;
  performedAt: string;
  isAnomaly: boolean;
}

export interface AuditSummary {
  totalMovements: number;
  totalReceived: number;
  totalIssued: number;
  uniqueItems: number;
  uniquePersonnel: number;
}

export interface AuditPageResult {
  rows: AuditMovementRow[];
  total: number;
  summary: AuditSummary;
}

export interface PersonnelActivityRow {
  performedBy: string;
  receiveCount: number;
  issueCount: number;
  totalQuantity: number;
  distinctItems: number;
}

export interface ItemActivityRow {
  itemId: string;
  itemName: string;
  itemSku: string;
  receiveCount: number;
  issueCount: number;
  totalReceived: number;
  totalIssued: number;
  netChange: number;
  currentQuantity: number;
}

export interface AlertFrequencyRow {
  itemId: string;
  itemName: string;
  itemSku: string;
  triggerCount: number;
  lastTriggeredAt: string;
  currentStatus: string;
  currentQuantity: number;
}

export interface AuditAnalyticsResult {
  summary: AuditSummary;
  byPersonnel: PersonnelActivityRow[];
  byItem: ItemActivityRow[];
  alertFrequency: AlertFrequencyRow[];
}

// ─── Period Report Types (Reports / Period Summary tab) ──────────────────────

// Period math (granularity, args) lives in ./auditPeriod and is the source of
// truth; re-exported here so consumers import report types from one place.
export type { AuditPeriodGranularity, AuditReportPeriodArgs } from "./auditPeriod";

export interface AuditReportTotals {
  totalMovements: number;
  totalReceivedQty: number;
  totalIssuedQty: number;
  netQty: number;
  receivedValueMinor: number; // qty * current unit_price_minor (priced items only)
  issuedValueMinor: number;
  netValueMinor: number; // received - issued
  valuedItemCount: number; // distinct moved items WITH a price set
  unvaluedItemCount: number; // distinct moved items with NULL price (excluded from value)
  hasData: boolean; // false when the window has no movements (vs a real zero)
}

export interface ItemValueRow {
  itemId: string;
  itemName: string;
  itemSku: string;
  issuedQty: number;
  issuedValueMinor: number;
  hasPrice: boolean; // false → contributes qty but not value
}

export interface MoverRow {
  itemId: string;
  itemName: string;
  itemSku: string;
  currentIssuedValueMinor: number;
  priorIssuedValueMinor: number;
  deltaValueMinor: number; // signed; rows sorted by |delta| desc
}

export interface TrendPoint {
  label: string;
  issuedValueMinor: number;
}

export interface AuditReportResult {
  period: { label: string; from: string; to: string };
  priorPeriod: { label: string; from: string; to: string };
  yoyPeriod: { label: string; from: string; to: string };
  totals: AuditReportTotals;
  priorTotals: AuditReportTotals;
  yoyTotals: AuditReportTotals;
  topItems: ItemValueRow[];
  biggestMovers: MoverRow[];
  trend: TrendPoint[]; // last 6 periods, oldest -> newest, gap-free
  inventoryHealth: { lowOrZeroItemCount: number };
  analytics: AuditAnalyticsResult; // current period, from getAuditAnalytics
  currency: CurrencyCode;
}
