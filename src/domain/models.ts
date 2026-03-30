export type Language = "en" | "zh-CN";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type RefillOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

export interface InventoryItem {
  id: string;
  sku: string;
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

export interface RefillOrderLine {
  id: string;
  itemName: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
}

export interface RefillOrder {
  id: string;
  orderNumber: string;
  supplier: string;
  orderDate: string;
  expectedDeliveryDate: string;
  receivedDate?: string;
  status: RefillOrderStatus;
  totalAmount: number;
  createdBy: string;
  lines: RefillOrderLine[];
}

export interface PersonnelMember {
  id: string;
  name: string;
}

export interface BackupPlan {
  targetPath: string;
  targetType: "local_folder" | "lan_share" | "cloud_folder";
  schedule: string;
  retention: string;
  lastSuccessfulBackup: string;
  nextScheduledBackup: string;
  status: "healthy" | "warning";
}

export interface DashboardMetrics {
  totalItems: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  openAlertCount: number;
  pendingRefillOrderCount: number;
}

export interface AppSnapshot {
  items: InventoryItem[];
  alerts: InventoryAlert[];
  refillOrders: RefillOrder[];
  personnel: PersonnelMember[];
  backupPlan: BackupPlan;
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

export interface CreateRefillOrderInput {
  orderNumber: string;
  supplier: string;
  itemId: string;
  orderDate: string;
  expectedDeliveryDate: string;
  createdBy: string;
  orderedQuantity: number;
  unitCost: number;
}

export interface AddPersonnelInput {
  name: string;
}

export type ActionKind =
  | "createItem"
  | "modifyItem"
  | "receiveStock"
  | "issueMaterial"
  | "createRefillOrder"
  | "removeItem";
