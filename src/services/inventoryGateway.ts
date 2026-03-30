import type {
  AddPersonnelInput,
  AppSnapshot,
  CreateInventoryItemInput,
  CreateRefillOrderInput,
  InventoryItem,
  PersonnelMember,
  StockMutationInput,
  StockStatus,
  UpdateInventoryItemInput,
} from "../domain/models";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

let browserSnapshot = emptySnapshot();

function emptySnapshot(): AppSnapshot {
  return {
    items: [],
    alerts: [],
    refillOrders: [],
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

  browserSnapshot.refillOrders.forEach((order) => {
    order.lines.forEach((line) => {
      if (line.sku === previousSku) {
        line.sku = item.sku;
        line.itemName = item.name;
      }
    });
  });

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

function applyCreateRefillOrder(input: CreateRefillOrderInput): AppSnapshot {
  const item = getItemOrThrow(input.itemId);
  if (browserSnapshot.refillOrders.some((order) => order.orderNumber.toLowerCase() === input.orderNumber.trim().toLowerCase())) {
    throw new Error("Order number already exists.");
  }

  const order = {
    id: createId("order"),
    orderNumber: input.orderNumber.trim(),
    supplier: input.supplier.trim(),
    orderDate: input.orderDate,
    expectedDeliveryDate: input.expectedDeliveryDate,
    receivedDate: undefined,
    status: "ordered" as const,
    totalAmount: input.orderedQuantity * input.unitCost,
    createdBy: input.createdBy.trim(),
    lines: [
      {
        id: createId("line"),
        itemName: item.name,
        sku: item.sku,
        orderedQuantity: input.orderedQuantity,
        receivedQuantity: 0,
        unitCost: input.unitCost,
      },
    ],
  };

  browserSnapshot = {
    ...browserSnapshot,
    refillOrders: [order, ...browserSnapshot.refillOrders],
  };
  return browserSnapshot;
}

function applyRemoveInventoryItem(itemId: string): AppSnapshot {
  const item = getItemOrThrow(itemId);

  browserSnapshot = {
    ...browserSnapshot,
    items: browserSnapshot.items.filter((entry) => entry.id !== itemId),
    alerts: browserSnapshot.alerts.filter((alert) => alert.sku !== item.sku),
    refillOrders: browserSnapshot.refillOrders.filter(
      (order) => !order.lines.some((line) => line.sku === item.sku),
    ),
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
  const tauriInvoke = window.__TAURI_INTERNALS__?.invoke;
  if (!tauriInvoke) {
    return fallback();
  }
  return tauriInvoke<T>(command, args);
}

export async function loadAppSnapshot(): Promise<AppSnapshot> {
  const tauriInvoke = window.__TAURI_INTERNALS__?.invoke;

  if (!tauriInvoke) {
    return browserSnapshot;
  }

  return tauriInvoke<AppSnapshot>("load_app_snapshot");
}

export async function createInventoryItem(input: CreateInventoryItemInput): Promise<AppSnapshot> {
  return invokeOrFallback("create_inventory_item", { input }, () => applyCreateInventoryItem(input));
}

export async function updateInventoryItem(input: UpdateInventoryItemInput): Promise<AppSnapshot> {
  return invokeOrFallback("update_inventory_item", { input }, () => applyUpdateInventoryItem(input));
}

export async function receiveStock(input: StockMutationInput): Promise<AppSnapshot> {
  return invokeOrFallback("receive_stock", { input }, () => applyReceiveStock(input));
}

export async function issueMaterial(input: StockMutationInput): Promise<AppSnapshot> {
  return invokeOrFallback("issue_material", { input }, () => applyIssueMaterial(input));
}

export async function createRefillOrder(input: CreateRefillOrderInput): Promise<AppSnapshot> {
  return invokeOrFallback("create_refill_order", { input }, () => applyCreateRefillOrder(input));
}

export async function removeInventoryItem(itemId: string): Promise<AppSnapshot> {
  return invokeOrFallback("remove_inventory_item", { itemId }, () => applyRemoveInventoryItem(itemId));
}

export async function addPersonnel(input: AddPersonnelInput): Promise<AppSnapshot> {
  return invokeOrFallback("add_personnel", { input }, () => applyAddPersonnel(input));
}

export async function removePersonnel(personnelId: string): Promise<AppSnapshot> {
  return invokeOrFallback("remove_personnel", { personnelId }, () => applyRemovePersonnel(personnelId));
}

