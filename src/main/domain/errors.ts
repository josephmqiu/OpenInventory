import { Data } from "effect";

export type BackendLanguage = "en" | "zh-CN";

export function normalizeBackendLanguage(language: string | null | undefined): BackendLanguage {
  return language === "zh-CN" ? "zh-CN" : "en";
}

export type TransportMessageValues = Record<string, string | number>;

export const backendMessages = () => ({
  personnelNotFound: "personnelNotFound",
  personnelNameAlreadyExists: "personnelNameAlreadyExists",
  invalidAccessKey: "invalidAccessKey",
  tooManyFailedAccessKeyAttempts: "tooManyFailedAccessKeyAttempts",
  notFound: "notFound",
  itemNotFound: "itemNotFound",
  skuAlreadyExists: "skuAlreadyExists",
  nameAlreadyExists: "nameAlreadyExists",
  quantityValuesMustBeZeroOrGreater: "quantityValuesMustBeZeroOrGreater",
  reorderLevelMustBeZeroOrGreater: "reorderLevelMustBeZeroOrGreater",
  receiveQuantityMustBeGreaterThanZero: "receiveQuantityMustBeGreaterThanZero",
  issueQuantityMustBeGreaterThanZero: "issueQuantityMustBeGreaterThanZero",
  batchIssueMustIncludeAtLeastOneItem: "batchIssueMustIncludeAtLeastOneItem",
  backupTargetPathRequired: "backupTargetPathRequired",
  backupTargetPathNotAbsolute: "backupTargetPathNotAbsolute",
  backupTargetPathNotWritable: "backupTargetPathNotWritable",
  requestBodyTooLarge: "requestBodyTooLarge",
  invalidJsonBody: "invalidJsonBody",
  forbidden: "forbidden",
  unexpectedError: "unexpectedError",
  databaseError: "databaseError",
  serverError: "serverError",
  lanServerRunning: "lanServerRunning",
  lanServerStopped: "lanServerStopped",
  lanServerError: "lanServerError",
  movementNotFound: "movementNotFound",
  insufficientStockWhenDeletingMovement: "insufficientStockWhenDeletingMovement",
  invalidMovementType: "invalidMovementType",
}) as const;

interface AppErrorPayload {
  readonly messageId: string;
  readonly messageValues?: TransportMessageValues;
  readonly debugMessage?: string;
}

function messageText(payload: AppErrorPayload): string {
  return payload.debugMessage ?? payload.messageId;
}

export function validationError(
  messageId: string,
  messageValues?: TransportMessageValues,
  debugMessage?: string,
): ValidationError {
  return new ValidationError({ messageId, messageValues, debugMessage });
}

export function notFoundError(
  messageId: string,
  messageValues?: TransportMessageValues,
  debugMessage?: string,
): NotFoundError {
  return new NotFoundError({ messageId, messageValues, debugMessage });
}

export function duplicateSkuError(
  messageId: string,
  messageValues?: TransportMessageValues,
  debugMessage?: string,
): DuplicateSkuError {
  return new DuplicateSkuError({ messageId, messageValues, debugMessage });
}

export class NotFoundError extends Data.TaggedError("NotFoundError")<AppErrorPayload> {
  get message(): string {
    return messageText(this);
  }
}

export class DuplicateSkuError extends Data.TaggedError("DuplicateSkuError")<AppErrorPayload> {
  get message(): string {
    return messageText(this);
  }
}

export class InsufficientStockError extends Data.TaggedError(
  "InsufficientStockError",
)<{
  readonly available: number;
  readonly requested: number;
  readonly itemName?: string;
  readonly sku?: string;
  readonly debugMessage?: string;
}> {
  get messageId(): string {
    return "insufficientStock";
  }

  get messageValues(): TransportMessageValues {
    return {
      requested: this.requested,
      available: this.available,
    };
  }

  get message(): string {
    return this.debugMessage ?? this.messageId;
  }
}

export class ValidationError extends Data.TaggedError("ValidationError")<AppErrorPayload> {
  get message(): string {
    return messageText(this);
  }
}

export class IoError extends Data.TaggedError("IoError")<AppErrorPayload> {
  get message(): string {
    return messageText(this);
  }
}

export class ServerError extends Data.TaggedError("ServerError")<AppErrorPayload> {
  get message(): string {
    return messageText(this);
  }
}

export class DatabaseError extends Data.TaggedError("DatabaseError")<AppErrorPayload> {
  get message(): string {
    return messageText(this);
  }
}

export type AppError =
  | NotFoundError
  | DuplicateSkuError
  | InsufficientStockError
  | ValidationError
  | IoError
  | ServerError
  | DatabaseError;

/** Serialize an AppError to a transport-safe object preserving _tag. */
export function serializeAppError(error: unknown): { _tag: string; messageId: string; messageValues?: TransportMessageValues; debugMessage?: string } {
  if (error && typeof error === "object" && "_tag" in error) {
    const appError = error as AppError;
    const base = {
      _tag: appError._tag,
      messageId: "messageId" in appError ? appError.messageId : "serverError",
      messageValues: "messageValues" in appError ? appError.messageValues : undefined,
      debugMessage: appError.message,
    };
    if (appError._tag === "InsufficientStockError") {
      return base;
    }
    return base;
  }
  return { _tag: "ServerError", messageId: "serverError", debugMessage: String(error) };
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
