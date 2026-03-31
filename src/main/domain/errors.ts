import { Data } from "effect";

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
}> {
  get message(): string {
    return `Cannot issue ${this.requested} units. Current available stock is ${this.available}.`;
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
