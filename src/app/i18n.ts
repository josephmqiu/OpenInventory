import type { ActionKind, BackupTargetType, Language, StockStatus } from "../domain/models";

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

export function localizeLanguageName(value: Language): string {
  return languageLabels[value];
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
  notAvailable: string;
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
}

export const dictionaries: Record<Language, Dictionary> = {
  en: {
    appName: "Inventory Monitor",
    tagline: "Local-first inventory control with low-stock alerts and backup readiness.",
    dashboard: "Dashboard",
    inventory: "Inventory",
    itemManagement: "Item Management",
    alerts: "Alerts",
    personnel: "Personnel",
    settings: "Settings",
    currentInventoryLevels: "Current Inventory Levels",
    inventoryOperationsHint: "Receive and issue stock from the live inventory list.",
    manageItemsHint: "Create, modify, delete, and print item QR labels from this page.",
    currentQuantityManagedHint: "Current quantity is managed through Receive Stock and Issue Material, not through item editing.",
    totalItems: "Total Items",
    totalUnits: "Total Units",
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
    backupReady: "Backup target validated",
    needsAttention: "Needs attention",
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
    notAvailable: "Not configured",
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
  },
  "zh-CN": {
    appName: "库存监控",
    tagline: "支持低库存预警和备份管理的本地库存系统。",
    dashboard: "概览",
    inventory: "库存",
    itemManagement: "物料管理",
    alerts: "预警",
    personnel: "人员管理",
    settings: "设置",
    currentInventoryLevels: "当前库存水平",
    inventoryOperationsHint: "在当前库存列表中执行入库和出库操作。",
    manageItemsHint: "在此页面创建、修改、删除物料，并打印二维码标签。",
    currentQuantityManagedHint: "当前数量通过入库和出库管理，不在物料编辑中修改。",
    totalItems: "物料总数",
    totalUnits: "库存总量",
    lowStock: "低库存",
    outOfStock: "缺货",
    openAlerts: "未处理预警",
    sku: "SKU",
    itemName: "物料名称",
    category: "类别",
    location: "位置",
    currentQuantity: "当前数量",
    unit: "单位",
    reorderLevel: "补货量",
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
    backupReady: "备份目标已验证",
    needsAttention: "需要处理",
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
    notAvailable: "未配置",
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
      `${itemName} (${sku}) 已触发低库存预警。当前数量为 ${currentQuantity}，补货量为 ${thresholdQuantity}。`,
    formValidationError: "请检查必填项和数量输入。",
  },
};
