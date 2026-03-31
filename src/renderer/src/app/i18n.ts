import type { ActionKind, AlertStatus, BackupTargetType, Language, StockStatus } from "../domain/models";

export const DEFAULT_CATEGORIES = [
  "Raw Material",
  "Parts",
  "Chemical",
  "Packaging",
  "Consumable",
  "Finished Goods",
] as const;

export const UNIT_OPTIONS = ["pcs", "kg", "g", "liters", "meters", "boxes", "packs", "rolls", "sheets"] as const;

const categoryLabels: Record<Language, Record<string, string>> = {
  en: {
    "Raw Material": "Raw Material",
    Parts: "Parts",
    Chemical: "Chemical",
    Packaging: "Packaging",
    Consumable: "Consumable",
    "Finished Goods": "Finished Goods",
    原材料: "Raw Material",
    零件: "Parts",
    化学品: "Chemical",
    包装: "Packaging",
    消耗品: "Consumable",
    成品: "Finished Goods",
  },
  "zh-CN": {
    "Raw Material": "原材料",
    Parts: "零件",
    Chemical: "化学品",
    Packaging: "包装",
    Consumable: "消耗品",
    "Finished Goods": "成品",
    原材料: "原材料",
    零件: "零件",
    化学品: "化学品",
    包装: "包装",
    消耗品: "消耗品",
    成品: "成品",
  },
};

const unitLabels: Record<Language, Record<string, string>> = {
  en: {
    pcs: "pcs",
    件: "pcs",
    kg: "kg",
    千克: "kg",
    g: "g",
    克: "g",
    liters: "liters",
    升: "liters",
    meters: "meters",
    米: "meters",
    boxes: "boxes",
    箱: "boxes",
    packs: "packs",
    包: "packs",
    rolls: "rolls",
    卷: "rolls",
    sheets: "sheets",
    张: "sheets",
  },
  "zh-CN": {
    pcs: "件",
    件: "件",
    kg: "千克",
    千克: "千克",
    g: "克",
    克: "克",
    liters: "升",
    升: "升",
    meters: "米",
    米: "米",
    boxes: "箱",
    箱: "箱",
    packs: "包",
    包: "包",
    rolls: "卷",
    卷: "卷",
    sheets: "张",
    张: "张",
  },
};

const backupTargetTypeLabels: Record<Language, Record<BackupTargetType, string>> = {
  en: {
    local_folder: "Local Folder",
    lan_share: "LAN Share",
    cloud_folder: "Cloud Folder",
  },
  "zh-CN": {
    local_folder: "本地文件夹",
    lan_share: "局域网共享",
    cloud_folder: "云同步文件夹",
  },
};

const stockStatusLabels: Record<Language, Record<StockStatus, string>> = {
  en: {
    in_stock: "In Stock",
    low_stock: "Low Stock",
    out_of_stock: "Out Of Stock",
  },
  "zh-CN": {
    in_stock: "有库存",
    low_stock: "低库存",
    out_of_stock: "缺货",
  },
};

const alertStatusLabels: Record<Language, Record<AlertStatus, string>> = {
  en: {
    open: "Open",
    resolved: "Resolved",
  },
  "zh-CN": {
    open: "未处理",
    resolved: "已解决",
  },
};

const languageLabels: Record<Language, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

export function localizeCategory(value: string, language: Language): string {
  return categoryLabels[language][value] ?? value;
}

export function localizeUnit(value: string, language: Language): string {
  return unitLabels[language][value] ?? value;
}

export function localizeBackupTargetType(value: BackupTargetType, language: Language): string {
  return backupTargetTypeLabels[language][value];
}

export function localizeStockStatus(value: StockStatus, language: Language): string {
  return stockStatusLabels[language][value];
}

export function localizeAlertStatus(value: AlertStatus, language: Language): string {
  return alertStatusLabels[language][value];
}

export function localizeLanguageName(value: Language): string {
  return languageLabels[value];
}

export function localizeBackendMessage(message: string, dictionary: Dictionary): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return dictionary.genericActionError;
  }

  const exactMatches: Record<string, string> = {
    "SKU already exists.": dictionary.duplicateSkuError,
    "Item not found.": dictionary.itemNotFound,
    "Receive quantity must be greater than zero.": dictionary.quantityMustBeGreaterThanZero,
    "Issue quantity must be greater than zero.": dictionary.quantityMustBeGreaterThanZero,
    "Batch issue must include at least one item.": dictionary.batchIssueRequiresAtLeastOneItem,
    "Backup target path is required before running a backup.": dictionary.backupTargetPathRequired,
    "Unable to complete the requested action.": dictionary.genericActionError,
    "LAN server management is only available in the desktop app.": dictionary.lanDesktopOnly,
    "LAN access settings updated.": dictionary.lanAccessUpdated,
    "LAN access disabled.": dictionary.lanAccessDisabled,
    "LAN access key regenerated.": dictionary.lanAccessKeyRegenerated,
    "Enter the LAN access key shown in the desktop app.": dictionary.enterLanAccessKey,
    "Dev preview - LAN server runs only in Electron.": dictionary.devPreviewLanStatus,
    "Dev preview — LAN server runs only in Electron.": dictionary.devPreviewLanStatus,
  };

  if (trimmed in exactMatches) {
    return exactMatches[trimmed];
  }

  if (trimmed.endsWith(" is required.")) {
    return dictionary.formValidationError;
  }

  const insufficientStockMatch = trimmed.match(/^Cannot issue (\d+) units\. Current available stock is (\d+)\.$/);
  if (insufficientStockMatch) {
    return dictionary.insufficientStockError(
      Number(insufficientStockMatch[1]),
      Number(insufficientStockMatch[2]),
    );
  }

  if (trimmed.startsWith("Batch issue failed for ")) {
    return dictionary.batchIssueFailed;
  }

  return trimmed;
}

export interface Dictionary {
  appName: string;
  tagline: string;
  dashboard: string;
  inventory: string;
  itemManagement: string;
  alerts: string;
  personnel: string;
  settings: string;
  alertsPanelHint: string;
  currentInventoryLevels: string;
  inventoryOperationsHint: string;
  manageItemsHint: string;
  currentQuantityManagedHint: string;
  totalItems: string;
  totalUnits: string;
  lowStock: string;
  outOfStock: string;
  openAlerts: string;
  sku: string;
  itemName: string;
  category: string;
  location: string;
  currentQuantity: string;
  unit: string;
  reorderLevel: string;
  status: string;
  lastUpdated: string;
  supplier: string;
  backupPlan: string;
  targetPath: string;
  targetType: string;
  schedule: string;
  retention: string;
  lastBackup: string;
  nextBackup: string;
  language: string;
  backupReady: string;
  needsAttention: string;
  genericActionError: string;
  createItem: string;
  modifyItem: string;
  receiveStock: string;
  issueMaterial: string;
  batchIssue: string;
  removeItem: string;
  manage: string;
  actions: string;
  loadingWorkspace: string;
  noInventoryItems: string;
  noInventoryItemsHint: string;
  noAlerts: string;
  noAlertsHint: string;
  backupStorageHint: string;
  backupNotConfigured: string;
  lanAccess: string;
  lanEnabled: string;
  lanDisabled: string;
  lanPort: string;
  lanAccessKey: string;
  lanStatus: string;
  lanStatusRunning: string;
  lanStatusStopped: string;
  lanStatusError: string;
  lanOpenOnDevice: string;
  lanRegenerateKey: string;
  lanSaveSettings: string;
  lanNetworkHint: string;
  lanEnableHint: string;
  lanUrlsUnavailable: string;
  lanCopy: string;
  lanCopySuccess: string;
  lanCopyError: string;
  lanDesktopOnly: string;
  lanAccessUpdated: string;
  lanAccessDisabled: string;
  lanAccessKeyRegenerated: string;
  enterLanAccessKey: string;
  devPreviewLanStatus: string;
  authTitle: string;
  authDescription: string;
  authAccessKeyLabel: string;
  authConnect: string;
  managePersonnelHint: string;
  personnelName: string;
  addPersonnel: string;
  removePersonnel: string;
  noPersonnel: string;
  noPersonnelHint: string;
  selectPersonnel: string;
  personnelRequiredHint: string;
  notProvided: string;
  cancel: string;
  save: string;
  quantity: string;
  reason: string;
  performedBy: string;
  initialQuantity: string;
  selectItem: string;
  selectItemToRemove: string;
  optionalField: string;
  autoGeneratedIfBlank: string;
  addNewCategory: string;
  newCategoryName: string;
  deleteItemWarning: string;
  deleteItemImpact: string;
  viewDetails: string;
  backToList: string;
  itemDetails: string;
  itemDetailsHint: string;
  qrCode: string;
  qrCodeUnavailable: string;
  printQrLabel: string;
  printSelectedQrs: string;
  printLocation: string;
  selectAllItems: string;
  selectedItemsCount: (count: number) => string;
  issueCartTitle: string;
  issueCartHint: string;
  issueCartSelectedItems: string;
  issueCartNoSelection: string;
  issueCartInlineHint: string;
  movementHistory: string;
  movementHistoryHint: string;
  loadingMovements: string;
  noMovements: string;
  date: string;
  type: string;
  actionPanelTitle: Record<ActionKind, string>;
  actionPanelHint: Record<ActionKind, string>;
  successCreateItem: string;
  successUpdateItem: string;
  successReceiveStock: string;
  successIssueMaterial: string;
  successBatchIssueMaterial: string;
  successUpdateBackupPlan: string;
  successRemoveItem: string;
  successAddPersonnel: string;
  successRemovePersonnel: string;
  lowStockAlertIssued: (itemName: string, sku: string, currentQuantity: number, thresholdQuantity: number) => string;
  formValidationError: string;
  duplicateSkuError: string;
  itemNotFound: string;
  quantityMustBeGreaterThanZero: string;
  batchIssueRequiresAtLeastOneItem: string;
  batchIssueFailed: string;
  backupTargetPathRequired: string;
  insufficientStockError: (requested: number, available: number) => string;
  backupNow: string;
  backupNowInProgress: string;
  backupCompleted: string;
  disconnect: string;
  qrItemNotFound: string;
  qrIssueReason: string;
  personnelRequiredForIssue: string;
  inventoryDesktop: string;
  inventoryLan: string;
  darkMode: string;
  lightMode: string;
  autoMode: string;
  updateAvailable: string;
  updateDownloading: string;
  updateReady: string;
  updateError: string;
  updateDownload: string;
  updateRestart: string;
  updateLater: string;
  dismiss: string;
  // ─── Audit ──────────────────────────────────────────
  audit: string;
  auditHint: string;
  activityLog: string;
  activityLogHint: string;
  activitySummary: string;
  activitySummaryHint: string;
  dateFrom: string;
  dateTo: string;
  movementType: string;
  allTypes: string;
  itemSearch: string;
  textSearch: string;
  textSearchHint: string;
  applyFilters: string;
  clearFilters: string;
  today: string;
  thisWeek: string;
  thisMonth: string;
  last30Days: string;
  totalMovements: string;
  totalReceived: string;
  totalIssued: string;
  uniqueItemsMoved: string;
  uniquePersonnelActive: string;
  previousQuantity: string;
  newQuantity: string;
  referenceNo: string;
  notes: string;
  balance: string;
  byPersonnel: string;
  byItem: string;
  alertFrequency: string;
  receiveCount: string;
  issueCount: string;
  totalQuantityMoved: string;
  distinctItemsMoved: string;
  netChange: string;
  triggerCount: string;
  lastTriggered: string;
  pageOf: (current: number, total: number) => string;
  previousPage: string;
  nextPage: string;
  exportCsv: string;
  exportTruncated: (max: number) => string;
  auditDrillDown: string;
  auditDrillDownHint: (itemName: string) => string;
  noAuditData: string;
  noAuditDataHint: string;
  noAuditDataEver: string;
  noAuditDataEverHint: string;
  loadingAuditData: string;
  anomalyTooltip: (multiplier: number) => string;
  clickToFilter: string;
  retryLoad: string;
  goToInventory: string;
}

export const dictionaries: Record<Language, Dictionary> = {
  en: {
    appName: "OpenInventory",
    tagline: "Track stock, catch shortages, issue materials.",
    dashboard: "Dashboard",
    inventory: "Inventory",
    itemManagement: "Item Management",
    alerts: "Alerts",
    personnel: "Personnel",
    settings: "Settings",
    alertsPanelHint: "Threshold crossings, resolution status, and quantity at trigger time.",
    currentInventoryLevels: "Current Inventory Levels",
    inventoryOperationsHint: "Receive and issue stock from the live inventory list.",
    manageItemsHint: "Create, modify, delete, and print item QR labels from this page.",
    currentQuantityManagedHint: "Current quantity is managed through Receive Stock and Issue Material, not through item editing.",
    totalItems: "Total Items",
    totalUnits: "Combined Quantity",
    lowStock: "Low Stock",
    outOfStock: "Out Of Stock",
    openAlerts: "Open Alerts",
    sku: "SKU",
    itemName: "Item Name",
    category: "Category",
    location: "Location",
    currentQuantity: "Current Quantity",
    unit: "Unit",
    reorderLevel: "Reorder Level",
    status: "Status",
    lastUpdated: "Last Updated",
    supplier: "Supplier",
    backupPlan: "Backup Plan",
    targetPath: "Target Path",
    targetType: "Target Type",
    schedule: "Schedule",
    retention: "Retention",
    lastBackup: "Last Backup",
    nextBackup: "Next Backup",
    language: "Language",
    backupReady: "Configured",
    needsAttention: "Needs attention",
    genericActionError: "Unable to complete the requested action.",
    createItem: "Create Item",
    modifyItem: "Modify Item",
    receiveStock: "Receive Stock",
    issueMaterial: "Issue Material",
    batchIssue: "Batch Issue",
    removeItem: "Remove Item",
    manage: "Manage",
    actions: "Actions",
    loadingWorkspace: "Loading inventory workspace...",
    noInventoryItems: "No inventory records yet.",
    noInventoryItemsHint: "Create the first item to start tracking on-hand quantity and low-stock rules.",
    noAlerts: "No low-stock alerts.",
    noAlertsHint: "Alerts will appear when an item reaches or drops below its reorder level.",
    backupStorageHint: "Local database backups can be stored on LAN shares or cloud-synced folders.",
    backupNotConfigured: "Backup destination not configured yet.",
    lanAccess: "LAN Access",
    lanEnabled: "Enabled",
    lanDisabled: "Disabled",
    lanPort: "Port",
    lanAccessKey: "Access Key",
    lanStatus: "Status",
    lanStatusRunning: "Running",
    lanStatusStopped: "Stopped",
    lanStatusError: "Error",
    lanOpenOnDevice: "Open On Another Device",
    lanRegenerateKey: "Regenerate Access Key",
    lanSaveSettings: "Save LAN Settings",
    lanNetworkHint: "Devices must be on the same local network and use the access key shown below.",
    lanEnableHint: "Serve the inventory app on your local network so phones and tablets can look up and manage items.",
    lanUrlsUnavailable: "Enable LAN access to see device URLs.",
    lanCopy: "Copy",
    lanCopySuccess: "Access key copied to clipboard.",
    lanCopyError: "Unable to copy the access key on this device.",
    lanDesktopOnly: "LAN server management is only available in the desktop app.",
    lanAccessUpdated: "LAN access settings updated.",
    lanAccessDisabled: "LAN access disabled.",
    lanAccessKeyRegenerated: "LAN access key regenerated.",
    enterLanAccessKey: "Enter the LAN access key shown in the desktop app.",
    devPreviewLanStatus: "Dev preview - LAN server runs only in Electron.",
    authTitle: "LAN Inventory Access",
    authDescription: "Enter the access key from the desktop app to open the inventory workspace on this device.",
    authAccessKeyLabel: "Access Key",
    authConnect: "Connect",
    managePersonnelHint: "Manage the operator list used by stock movement forms.",
    personnelName: "Personnel Name",
    addPersonnel: "Add Personnel",
    removePersonnel: "Remove",
    noPersonnel: "No personnel records yet.",
    noPersonnelHint: "Add personnel before recording stock movements so Performed By can be selected from a list.",
    selectPersonnel: "Select Personnel",
    personnelRequiredHint: "Add at least one personnel record before receiving or issuing stock.",
    cancel: "Cancel",
    save: "Save",
    quantity: "Quantity",
    reason: "Reason",
    performedBy: "Performed By",
    initialQuantity: "Initial Quantity",
    selectItem: "Select Item",
    selectItemToRemove: "Select Item To Remove",
    optionalField: "Optional",
    autoGeneratedIfBlank: "Auto-generated if blank",
    notProvided: "Not provided",
    addNewCategory: "Add New Category",
    newCategoryName: "New Category Name",
    deleteItemWarning: "This permanently removes the item from inventory management.",
    deleteItemImpact: "Related stock movements and alerts for this item will also be removed.",
    viewDetails: "View Details",
    backToList: "Back To List",
    itemDetails: "Item Details",
    itemDetailsHint: "Review item information, preview the SKU QR label, and print it.",
    qrCode: "QR Code",
    qrCodeUnavailable: "QR code unavailable.",
    printQrLabel: "Print QR Label",
    printSelectedQrs: "Print Selected QR Codes",
    printLocation: "Location",
    selectAllItems: "Select All",
    selectedItemsCount: (count: number) => `${count} selected`,
    issueCartTitle: "Issue Cart",
    issueCartHint: "Issue multiple selected items in one transaction. Rows with zero quantity are skipped.",
    issueCartSelectedItems: "Selected Items",
    issueCartNoSelection: "Select at least one item to open the Issue Cart.",
    issueCartInlineHint: "Enter issue quantities for the items you want to issue. Blank or zero quantities will be ignored.",
    movementHistory: "Movement History",
    movementHistoryHint: "Latest 50 stock movements for this item.",
    loadingMovements: "Loading movement history...",
    noMovements: "No movements recorded yet.",
    date: "Date",
    type: "Type",
    actionPanelTitle: {
      createItem: "Create Inventory Item",
      modifyItem: "Modify Inventory Item",
      receiveStock: "Receive Stock",
      issueMaterial: "Issue Material",
      removeItem: "Remove Inventory Item",
    },
    actionPanelHint: {
      createItem: "Register a new inventory record with on-hand quantity and reorder thresholds.",
      modifyItem: "Update item master data without changing the on-hand quantity.",
      receiveStock: "Add materials into inventory and refresh the current quantity immediately.",
      issueMaterial: "Remove materials from inventory and evaluate low-stock alerts.",
      removeItem: "Remove an item and its related operational records from the inventory database.",
    },
    successCreateItem: "Inventory item created.",
    successUpdateItem: "Inventory item updated.",
    successReceiveStock: "Stock receipt recorded.",
    successIssueMaterial: "Material issue recorded.",
    successBatchIssueMaterial: "Batch material issue recorded.",
    successUpdateBackupPlan: "Backup settings updated.",
    successRemoveItem: "Inventory item removed.",
    successAddPersonnel: "Personnel added.",
    successRemovePersonnel: "Personnel removed.",
    lowStockAlertIssued: (itemName: string, sku: string, currentQuantity: number, thresholdQuantity: number) =>
      `Low-stock alert issued for ${itemName} (${sku}). Current quantity is ${currentQuantity}, reorder level is ${thresholdQuantity}.`,
    formValidationError: "Check the required fields and quantity values.",
    duplicateSkuError: "That SKU already exists.",
    itemNotFound: "Item not found.",
    quantityMustBeGreaterThanZero: "Quantity must be greater than zero.",
    batchIssueRequiresAtLeastOneItem: "Batch issue must include at least one item.",
    batchIssueFailed: "Batch issue could not be completed.",
    backupTargetPathRequired: "Backup target path is required before running a backup.",
    insufficientStockError: (requested: number, available: number) =>
      `Cannot issue ${requested} units. Current available stock is ${available}.`,
    backupNow: "Backup Now",
    backupNowInProgress: "Backing Up...",
    backupCompleted: "Backup completed.",
    disconnect: "Disconnect",
    qrItemNotFound: "This QR code points to an item that is not available in the current inventory database.",
    qrIssueReason: "QR issue",
    personnelRequiredForIssue: "No personnel configured. Add personnel in the desktop app before issuing material.",
    inventoryDesktop: "Desktop",
    inventoryLan: "LAN Access",
    darkMode: "Dark",
    lightMode: "Light",
    autoMode: "Auto",
    updateAvailable: "Version {version} is available",
    updateDownloading: "Downloading update... {percent}%",
    updateReady: "Update ready — restart to apply",
    updateError: "Update check failed",
    updateDownload: "Download",
    updateRestart: "Restart Now",
    updateLater: "Later",
    dismiss: "Dismiss",
    // ─── Audit ──────────────────────────────────────────
    audit: "Audit",
    auditHint: "Review movement history, personnel activity, and inventory trends.",
    activityLog: "Activity Log",
    activityLogHint: "Complete movement history across all inventory items.",
    activitySummary: "Activity Summary",
    activitySummaryHint: "Aggregated analytics by personnel, item, and alert frequency.",
    dateFrom: "From",
    dateTo: "To",
    movementType: "Movement Type",
    allTypes: "All Types",
    itemSearch: "Item Name or SKU",
    textSearch: "Reason / Reference / Notes",
    textSearchHint: "Search in reason, reference number, or notes fields.",
    applyFilters: "Apply",
    clearFilters: "Clear",
    today: "Today",
    thisWeek: "This Week",
    thisMonth: "This Month",
    last30Days: "Last 30 Days",
    totalMovements: "Total Movements",
    totalReceived: "Total Received",
    totalIssued: "Total Issued",
    uniqueItemsMoved: "Items Affected",
    uniquePersonnelActive: "Personnel Active",
    previousQuantity: "Prev Qty",
    newQuantity: "New Qty",
    referenceNo: "Reference No.",
    notes: "Notes",
    balance: "Balance",
    byPersonnel: "By Personnel",
    byItem: "By Item",
    alertFrequency: "Alert Frequency",
    receiveCount: "Receives",
    issueCount: "Issues",
    totalQuantityMoved: "Total Qty Moved",
    distinctItemsMoved: "Distinct Items",
    netChange: "Net Change",
    triggerCount: "Triggers",
    lastTriggered: "Last Triggered",
    pageOf: (current, total) => `Page ${current} of ${total}`,
    previousPage: "Previous",
    nextPage: "Next",
    exportCsv: "Export CSV",
    exportTruncated: (max) => `Export limited to first ${max.toLocaleString()} rows.`,
    auditDrillDown: "Item History",
    auditDrillDownHint: (itemName) => `All movements for ${itemName} in the selected date range.`,
    noAuditData: "No movements match the current filters.",
    noAuditDataHint: "Adjust the date range or filter criteria to find movement records.",
    noAuditDataEver: "No movements recorded yet.",
    noAuditDataEverHint: "Receive or issue inventory to see activity here.",
    loadingAuditData: "Loading audit data...",
    anomalyTooltip: (multiplier) => `This quantity is ${multiplier.toFixed(1)}x the average for this item.`,
    clickToFilter: "Click to filter",
    retryLoad: "Retry",
    goToInventory: "Go to Inventory",
  },
  "zh-CN": {
    appName: "OpenInventory",
    tagline: "库存跟踪、缺货预警、物料发放。",
    dashboard: "概览",
    inventory: "库存",
    itemManagement: "物料管理",
    alerts: "预警",
    personnel: "人员管理",
    settings: "设置",
    alertsPanelHint: "显示达到阈值的预警、处理状态以及触发时的数量。",
    currentInventoryLevels: "当前库存水平",
    inventoryOperationsHint: "在当前库存列表中执行入库和出库操作。",
    manageItemsHint: "在此页面创建、修改、删除物料，并打印二维码标签。",
    currentQuantityManagedHint: "当前数量通过入库和出库管理，不在物料编辑中修改。",
    totalItems: "物料总数",
    totalUnits: "合计数量",
    lowStock: "低库存",
    outOfStock: "缺货",
    openAlerts: "未处理预警",
    sku: "SKU",
    itemName: "物料名称",
    category: "类别",
    location: "位置",
    currentQuantity: "当前数量",
    unit: "单位",
    reorderLevel: "补货阈值",
    status: "状态",
    lastUpdated: "最后更新",
    supplier: "供应商",
    backupPlan: "备份方案",
    targetPath: "目标路径",
    targetType: "目标类型",
    schedule: "计划",
    retention: "保留策略",
    lastBackup: "上次备份",
    nextBackup: "下次备份",
    language: "语言",
    backupReady: "已配置",
    needsAttention: "需要处理",
    genericActionError: "无法完成请求的操作。",
    createItem: "新增物料",
    modifyItem: "修改物料",
    receiveStock: "入库",
    issueMaterial: "出库",
    batchIssue: "批量出库",
    removeItem: "移除物料",
    manage: "管理",
    actions: "操作",
    loadingWorkspace: "正在加载库存工作区...",
    noInventoryItems: "还没有库存记录。",
    noInventoryItemsHint: "先创建第一个物料，再开始跟踪现存数量和低库存规则。",
    noAlerts: "目前没有低库存预警。",
    noAlertsHint: "当物料数量降到或低于补货量时，预警会出现在这里。",
    backupStorageHint: "本地数据库备份可以保存到 LAN 共享或云同步文件夹。",
    backupNotConfigured: "还未配置备份目标。",
    lanAccess: "LAN 访问",
    lanEnabled: "启用",
    lanDisabled: "禁用",
    lanPort: "端口",
    lanAccessKey: "访问密钥",
    lanStatus: "状态",
    lanStatusRunning: "运行中",
    lanStatusStopped: "已停止",
    lanStatusError: "错误",
    lanOpenOnDevice: "在其他设备上打开",
    lanRegenerateKey: "重新生成访问密钥",
    lanSaveSettings: "保存 LAN 设置",
    lanNetworkHint: "设备必须连接到同一本地网络，并使用下方显示的访问密钥。",
    lanEnableHint: "在本地网络上提供库存应用，让手机和平板也能查询和管理物料。",
    lanUrlsUnavailable: "启用 LAN 访问后即可查看设备访问链接。",
    lanCopy: "复制",
    lanCopySuccess: "访问密钥已复制到剪贴板。",
    lanCopyError: "当前设备无法复制访问密钥。",
    lanDesktopOnly: "LAN 服务器管理仅可在桌面应用中使用。",
    lanAccessUpdated: "已更新 LAN 访问设置。",
    lanAccessDisabled: "已禁用 LAN 访问。",
    lanAccessKeyRegenerated: "已重新生成 LAN 访问密钥。",
    enterLanAccessKey: "请输入桌面应用中显示的 LAN 访问密钥。",
    devPreviewLanStatus: "开发预览 - LAN 服务器仅在 Electron 中运行。",
    authTitle: "LAN 库存访问",
    authDescription: "输入桌面应用中显示的访问密钥，即可在此设备上打开库存工作区。",
    authAccessKeyLabel: "访问密钥",
    authConnect: "连接",
    managePersonnelHint: "管理库存操作表单使用的人员列表。",
    personnelName: "人员姓名",
    addPersonnel: "新增人员",
    removePersonnel: "移除",
    noPersonnel: "还没有人员记录。",
    noPersonnelHint: "先新增人员，再记录入库或出库，这样“操作人”可以从列表选择。",
    selectPersonnel: "选择人员",
    personnelRequiredHint: "请先新增至少一名人员，再进行入库或出库。",
    cancel: "取消",
    save: "保存",
    quantity: "数量",
    reason: "原因",
    performedBy: "操作人",
    initialQuantity: "初始数量",
    selectItem: "选择物料",
    selectItemToRemove: "选择要移除的物料",
    optionalField: "可选",
    autoGeneratedIfBlank: "留空时自动生成",
    notProvided: "未填写",
    addNewCategory: "新增类别",
    newCategoryName: "新类别名称",
    deleteItemWarning: "这会将该物料从库存管理中永久移除。",
    deleteItemImpact: "该物料的库存变动和预警记录也会被删除。",
    viewDetails: "查看详情",
    backToList: "返回列表",
    itemDetails: "物料详情",
    itemDetailsHint: "查看物料信息、预览 SKU 二维码标签并打印。",
    qrCode: "二维码",
    qrCodeUnavailable: "二维码不可用。",
    printQrLabel: "打印二维码标签",
    printSelectedQrs: "打印已选二维码",
    printLocation: "库位",
    selectAllItems: "全选",
    selectedItemsCount: (count: number) => `已选择 ${count} 项`,
    issueCartTitle: "出库车",
    issueCartHint: "在一次事务中批量出库多个已选物料。数量为空或为 0 的行会被跳过。",
    issueCartSelectedItems: "已选物料",
    issueCartNoSelection: "请至少选择一个物料后再打开批量出库。",
    issueCartInlineHint: "只需为要出库的物料输入数量。为空或为 0 的数量将被忽略。",
    movementHistory: "出入库记录",
    movementHistoryHint: "显示该物料最近 50 条库存变动。",
    loadingMovements: "正在加载出入库记录...",
    noMovements: "暂无库存变动记录。",
    date: "日期",
    type: "类型",
    actionPanelTitle: {
      createItem: "新增库存物料",
      modifyItem: "修改库存物料",
      receiveStock: "记录入库",
      issueMaterial: "记录出库",
      removeItem: "移除库存物料",
    },
    actionPanelHint: {
      createItem: "创建新库存记录，并设定现有数量与补货阈值。",
      modifyItem: "更新物料主数据，不改变当前库存数量。",
      receiveStock: "将材料入库，并立即更新当前库存数量。",
      issueMaterial: "从库存中领用材料，并检查低库存预警。",
      removeItem: "将物料及其相关运营记录从库存数据库中删除。",
    },
    successCreateItem: "已创建库存物料。",
    successUpdateItem: "已更新库存物料。",
    successReceiveStock: "已记录入库。",
    successIssueMaterial: "已记录出库。",
    successBatchIssueMaterial: "已记录批量出库。",
    successUpdateBackupPlan: "已更新备份设置。",
    successRemoveItem: "已移除库存物料。",
    successAddPersonnel: "已新增人员。",
    successRemovePersonnel: "已移除人员。",
    lowStockAlertIssued: (itemName: string, sku: string, currentQuantity: number, thresholdQuantity: number) =>
      `${itemName} (${sku}) 已触发低库存预警。当前数量为 ${currentQuantity}，补货阈值为 ${thresholdQuantity}。`,
    formValidationError: "请检查必填项和数量输入。",
    duplicateSkuError: "该 SKU 已存在。",
    itemNotFound: "未找到物料。",
    quantityMustBeGreaterThanZero: "数量必须大于 0。",
    batchIssueRequiresAtLeastOneItem: "批量出库至少需要一项物料。",
    batchIssueFailed: "批量出库无法完成。",
    backupTargetPathRequired: "运行备份前必须设置目标路径。",
    insufficientStockError: (requested: number, available: number) =>
      `无法出库 ${requested} 件。当前可用库存为 ${available}。`,
    backupNow: "立即备份",
    backupNowInProgress: "正在备份...",
    backupCompleted: "备份完成。",
    disconnect: "断开连接",
    qrItemNotFound: "此二维码指向的物品在当前库存数据库中不可用。",
    qrIssueReason: "二维码出库",
    personnelRequiredForIssue: "未配置人员。请在桌面应用中添加人员后再发放物料。",
    inventoryDesktop: "桌面端",
    inventoryLan: "局域网访问",
    darkMode: "深色",
    lightMode: "浅色",
    autoMode: "自动",
    updateAvailable: "新版本 {version} 可用",
    updateDownloading: "正在下载更新... {percent}%",
    updateReady: "更新就绪 — 重启以应用",
    updateError: "检查更新失败",
    updateDownload: "下载",
    updateRestart: "立即重启",
    updateLater: "稍后",
    dismiss: "关闭",
    // ─── Audit ──────────────────────────────────────────
    audit: "审计",
    auditHint: "查看出入库历史、人员活动及库存趋势。",
    activityLog: "活动日志",
    activityLogHint: "所有库存物料的完整出入库历史。",
    activitySummary: "活动汇总",
    activitySummaryHint: "按人员、物料和预警频率汇总分析。",
    dateFrom: "开始日期",
    dateTo: "结束日期",
    movementType: "变动类型",
    allTypes: "全部类型",
    itemSearch: "物料名称或 SKU",
    textSearch: "原因 / 参考号 / 备注",
    textSearchHint: "在原因、参考号或备注字段中搜索。",
    applyFilters: "应用",
    clearFilters: "清除",
    today: "今天",
    thisWeek: "本周",
    thisMonth: "本月",
    last30Days: "近30天",
    totalMovements: "总变动数",
    totalReceived: "总入库量",
    totalIssued: "总出库量",
    uniqueItemsMoved: "涉及物料数",
    uniquePersonnelActive: "活跃人员数",
    previousQuantity: "变动前数量",
    newQuantity: "变动后数量",
    referenceNo: "参考号",
    notes: "备注",
    balance: "余额",
    byPersonnel: "按人员",
    byItem: "按物料",
    alertFrequency: "预警频率",
    receiveCount: "入库次数",
    issueCount: "出库次数",
    totalQuantityMoved: "总变动量",
    distinctItemsMoved: "涉及物料",
    netChange: "净变化",
    triggerCount: "触发次数",
    lastTriggered: "最近触发",
    pageOf: (current, total) => `第 ${current} 页，共 ${total} 页`,
    previousPage: "上一页",
    nextPage: "下一页",
    exportCsv: "导出 CSV",
    exportTruncated: (max) => `导出限制为前 ${max.toLocaleString()} 行。`,
    auditDrillDown: "物料历史",
    auditDrillDownHint: (itemName) => `所选日期范围内 ${itemName} 的所有变动记录。`,
    noAuditData: "当前筛选条件下没有匹配的变动记录。",
    noAuditDataHint: "调整日期范围或筛选条件以查找变动记录。",
    noAuditDataEver: "尚无出入库记录。",
    noAuditDataEverHint: "入库或出库后即可在此查看活动。",
    loadingAuditData: "正在加载审计数据...",
    anomalyTooltip: (multiplier) => `此数量是该物料平均值的 ${multiplier.toFixed(1)} 倍。`,
    clickToFilter: "点击按此值筛选",
    retryLoad: "重试",
    goToInventory: "前往库存",
  },
};
