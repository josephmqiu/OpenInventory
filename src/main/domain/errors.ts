import { Data } from "effect";

export type BackendLanguage = "en" | "zh-CN";

export function normalizeBackendLanguage(language: string | null | undefined): BackendLanguage {
  return language === "zh-CN" ? "zh-CN" : "en";
}

type BackendMessages = {
  requiredField: (label: string) => string;
  itemName: string;
  category: string;
  unit: string;
  location: string;
  performedBy: string;
  personnelName: string;
  personnelNotFound: string;
  personnelNameAlreadyExists: string;
  targetPath: string;
  invalidAccessKey: string;
  tooManyFailedAccessKeyAttempts: string;
  notFound: string;
  itemNotFound: string;
  skuAlreadyExists: string;
  nameAlreadyExists: string;
  insufficientStock: (requested: number, available: number) => string;
  quantityValuesMustBeZeroOrGreater: string;
  reorderLevelMustBeZeroOrGreater: string;
  receiveQuantityMustBeGreaterThanZero: string;
  issueQuantityMustBeGreaterThanZero: string;
  batchIssueMustIncludeAtLeastOneItem: string;
  batchIssueQuantityMustBeGreaterThanZero: (itemId: string) => string;
  batchIssueItemNotFound: (itemId: string) => string;
  batchIssueInsufficientStock: (itemName: string, sku: string, requested: number, available: number) => string;
  backupTargetPathRequired: string;
  requestBodyTooLarge: string;
  invalidJsonBody: string;
  forbidden: string;
  unexpectedError: string;
  databaseError: string;
  serverError: string;
  lanServerRunning: string;
  lanServerStopped: string;
  lanServerError: string;
};

const BACKEND_MESSAGES: Record<BackendLanguage, BackendMessages> = {
  en: {
    requiredField: (label) => `${label} is required.`,
    itemName: "Item name",
    category: "Category",
    unit: "Unit",
    location: "Location",
    performedBy: "Performed by",
    personnelName: "Personnel name",
    personnelNotFound: "Personnel record not found.",
    personnelNameAlreadyExists: "Personnel name already exists.",
    targetPath: "Backup target path",
    invalidAccessKey: "Invalid access key.",
    tooManyFailedAccessKeyAttempts:
      "Too many failed access key attempts from this device. Try again in 15 minutes.",
    notFound: "Not found.",
    itemNotFound: "Item not found.",
    skuAlreadyExists: "SKU already exists.",
    nameAlreadyExists: "Name already exists.",
    insufficientStock: (requested, available) =>
      `Cannot issue ${requested} units. Current available stock is ${available}.`,
    quantityValuesMustBeZeroOrGreater: "Quantity values must be zero or greater.",
    reorderLevelMustBeZeroOrGreater: "Reorder level must be zero or greater.",
    receiveQuantityMustBeGreaterThanZero: "Receive quantity must be greater than zero.",
    issueQuantityMustBeGreaterThanZero: "Issue quantity must be greater than zero.",
    batchIssueMustIncludeAtLeastOneItem: "Batch issue must include at least one item.",
    batchIssueQuantityMustBeGreaterThanZero: (itemId) =>
      `Batch issue failed for item ${itemId}: quantity must be greater than zero.`,
    batchIssueItemNotFound: (itemId) => `Batch issue failed for item ${itemId}: item not found.`,
    batchIssueInsufficientStock: (itemName, sku, requested, available) =>
      `Batch issue failed for ${itemName} (${sku}): cannot issue ${requested} units because only ${available} are available.`,
    backupTargetPathRequired: "Backup target path is required before running a backup.",
    requestBodyTooLarge: "Request body is too large.",
    invalidJsonBody: "Invalid JSON body.",
    forbidden: "Forbidden.",
    unexpectedError: "An unexpected error occurred.",
    databaseError: "Database operation failed.",
    serverError: "Server operation failed.",
    lanServerRunning: "LAN server is running.",
    lanServerStopped: "LAN server is stopped.",
    lanServerError: "LAN server error.",
  },
  "zh-CN": {
    requiredField: (label) => `${label}为必填项。`,
    itemName: "物料名称",
    category: "类别",
    unit: "单位",
    location: "位置",
    performedBy: "操作人",
    personnelName: "人员姓名",
    personnelNotFound: "未找到人员记录。",
    personnelNameAlreadyExists: "人员姓名已存在。",
    targetPath: "备份目标路径",
    invalidAccessKey: "访问密钥无效。",
    tooManyFailedAccessKeyAttempts: "此设备的访问密钥失败次数过多。请 15 分钟后重试。",
    notFound: "未找到。",
    itemNotFound: "未找到物料。",
    skuAlreadyExists: "SKU 已存在。",
    nameAlreadyExists: "名称已存在。",
    insufficientStock: (requested, available) =>
      `不能出库 ${requested} 件，当前可用库存为 ${available} 件。`,
    quantityValuesMustBeZeroOrGreater: "数量必须大于或等于 0。",
    reorderLevelMustBeZeroOrGreater: "补货阈值必须大于或等于 0。",
    receiveQuantityMustBeGreaterThanZero: "入库数量必须大于 0。",
    issueQuantityMustBeGreaterThanZero: "出库数量必须大于 0。",
    batchIssueMustIncludeAtLeastOneItem: "批量出库至少需要一个物料。",
    batchIssueQuantityMustBeGreaterThanZero: (itemId) =>
      `批量出库失败：物料 ${itemId} 的数量必须大于 0。`,
    batchIssueItemNotFound: (itemId) => `批量出库失败：未找到物料 ${itemId}。`,
    batchIssueInsufficientStock: (itemName, sku, requested, available) =>
      `批量出库失败：${itemName}（${sku}）最多只能出库 ${available} 件，不能出库 ${requested} 件。`,
    backupTargetPathRequired: "执行备份前需要先填写备份目标路径。",
    requestBodyTooLarge: "请求体过大。",
    invalidJsonBody: "JSON 请求体无效。",
    forbidden: "禁止访问。",
    unexpectedError: "发生了意外错误。",
    databaseError: "数据库操作失败。",
    serverError: "服务器操作失败。",
    lanServerRunning: "局域网服务正在运行。",
    lanServerStopped: "局域网服务已停止。",
    lanServerError: "局域网服务发生错误。",
  },
};

export function backendMessages(language: string | null | undefined): BackendMessages {
  return BACKEND_MESSAGES[normalizeBackendLanguage(language)];
}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly message: string;
}> {}

export class DuplicateSkuError extends Data.TaggedError("DuplicateSkuError")<{
  readonly message: string;
}> {}

export class InsufficientStockError extends Data.TaggedError(
  "InsufficientStockError",
)<{
  readonly available: number;
  readonly requested: number;
  readonly language: BackendLanguage;
}> {
  get message(): string {
    return backendMessages(this.language).insufficientStock(this.requested, this.available);
  }
}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
}> {}

export class IoError extends Data.TaggedError("IoError")<{
  readonly message: string;
}> {}

export class ServerError extends Data.TaggedError("ServerError")<{
  readonly message: string;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string;
}> {}

export type AppError =
  | NotFoundError
  | DuplicateSkuError
  | InsufficientStockError
  | ValidationError
  | IoError
  | ServerError
  | DatabaseError;

/** Serialize any AppError to a plain string for IPC transport */
export function serializeError(error: AppError): string {
  return error.message;
}

/** Map AppError to HTTP status code for LAN API */
export function errorToHttpStatus(error: AppError): number {
  switch (error._tag) {
    case "NotFoundError":
      return 404;
    case "DuplicateSkuError":
    case "InsufficientStockError":
      return 409;
    case "ValidationError":
      return 400;
    default:
      return 500;
  }
}
