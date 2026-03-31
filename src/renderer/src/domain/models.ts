export type Language = "en" | "zh-CN";

export type UpdateStatus =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "available"; version: string; releaseNotes: string }
  | { stage: "not-available"; version: string }
  | { stage: "downloading"; percent: number; transferred: number; total: number }
  | { stage: "downloaded"; version: string }
  | { stage: "error"; message: string };

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type AlertStatus = "open" | "resolved";
export type BackupTargetType = "local_folder" | "lan_share" | "cloud_folder";
export type BackupStatus = "healthy" | "warning";
export type LanAccessStatus = "running" | "stopped" | "error";

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

export interface BackupPlan {
  targetPath: string;
  targetType: BackupTargetType;
  schedule: string;
  retention: string;
  lastSuccessfulBackup: string;
  nextScheduledBackup: string;
  status: BackupStatus;
}

export interface LanAccessState {
  enabled: boolean;
  port: number;
  accessKey: string;
  urls: string[];
  status: LanAccessStatus;
  statusMessage: string;
}

export interface PublicIssueContext {
  item: InventoryItem;
  personnel: PersonnelMember[];
  language: Language;
}

export interface UpdateBackupPlanInput {
  targetPath: string;
  targetType: BackupTargetType;
  schedule: string;
  retention: string;
}

export interface UpdateLanAccessInput {
  enabled: boolean;
  port: number;
}

export interface DashboardMetrics {
  totalItems: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  openAlertCount: number;
}

export interface AppSnapshot {
  items: InventoryItem[];
  alerts: InventoryAlert[];
  personnel: PersonnelMember[];
  backupPlan: BackupPlan;
  language: Language;
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

export interface BatchIssueItem {
  itemId: string;
  quantity: number;
}

export interface BatchIssueMaterialInput {
  items: BatchIssueItem[];
  performedBy: string;
  reason: string;
}

export interface AddPersonnelInput {
  name: string;
}

export type ActionKind =
  | "createItem"
  | "modifyItem"
  | "receiveStock"
  | "issueMaterial"
  | "removeItem";

// ─── Audit Types ─────────────────────────────────────────────────────────────

export interface AuditMovementFilters {
  dateFrom?: string;
  dateTo?: string;
  movementType?: "receive" | "issue";
  itemId?: string;
  itemSearch?: string;
  performedBy?: string;
  textSearch?: string;
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
