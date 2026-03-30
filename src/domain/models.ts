export type Language = "en" | "zh-CN";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type AlertStatus = "open" | "acknowledged" | "resolved";
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

export interface AddPersonnelInput {
  name: string;
}

export type ActionKind =
  | "createItem"
  | "modifyItem"
  | "receiveStock"
  | "issueMaterial"
  | "removeItem";

