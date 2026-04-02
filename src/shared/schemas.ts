/**
 * @effect/schema decoders for all IPC and HTTP boundary inputs.
 * Also defines the IPC result envelope and transport error types.
 */
import { Schema } from "@effect/schema";

// ─── Primitives ──────────────────────────────────────────────────────────────

export const LanguageSchema = Schema.Literal("en", "zh-CN");

export const BackupIntervalUnitSchema = Schema.Literal(
  "hours",
  "days",
  "weeks",
);

export const AuditMovementTypeSchema = Schema.Literal("receive", "issue");

// Safe number types: reject NaN, Infinity, and out-of-range values.
const FiniteNumber = Schema.Number.pipe(Schema.finite());
const NonNegativeInt = Schema.Number.pipe(Schema.finite(), Schema.int(), Schema.greaterThanOrEqualTo(0));
const PositiveInt = Schema.Number.pipe(Schema.finite(), Schema.int(), Schema.greaterThan(0));
const PortNumber = Schema.Number.pipe(Schema.int(), Schema.between(0, 65535));
const PageNumber = Schema.Number.pipe(Schema.finite(), Schema.int(), Schema.greaterThanOrEqualTo(1));
const PageSize = Schema.Number.pipe(Schema.finite(), Schema.int(), Schema.between(1, 10000));

// ─── IPC Arg Schemas ─────────────────────────────────────────────────────────
// Each schema matches the `args` object shape the IPC handler receives.

export const CreateInventoryItemArgs = Schema.Struct({
  input: Schema.Struct({
    sku: Schema.String,
    name: Schema.String,
    category: Schema.String,
    location: Schema.String,
    unit: Schema.String,
    supplier: Schema.String,
    reorderQuantity: NonNegativeInt,
    initialQuantity: NonNegativeInt,
  }),
});

export const UpdateInventoryItemArgs = Schema.Struct({
  input: Schema.Struct({
    itemId: Schema.String,
    sku: Schema.String,
    name: Schema.String,
    category: Schema.String,
    location: Schema.String,
    unit: Schema.String,
    supplier: Schema.String,
    reorderQuantity: NonNegativeInt,
  }),
});

export const StockMutationArgs = Schema.Struct({
  input: Schema.Struct({
    itemId: Schema.String,
    quantity: PositiveInt,
    reason: Schema.String,
    performedBy: Schema.String,
  }),
});

export const BatchIssueMaterialArgs = Schema.Struct({
  input: Schema.Struct({
    items: Schema.Array(
      Schema.Struct({
        itemId: Schema.String,
        quantity: PositiveInt,
      }),
    ),
    performedBy: Schema.String,
    reason: Schema.String,
  }),
});

export const UpdateBackupPlanArgs = Schema.Struct({
  input: Schema.Struct({
    targetPath: Schema.String,
    intervalValue: NonNegativeInt,
    intervalUnit: BackupIntervalUnitSchema,
    onStartup: Schema.Boolean,
  }),
});

export const AddPersonnelArgs = Schema.Struct({
  input: Schema.Struct({
    name: Schema.String,
  }),
});

export const UpdateLanAccessArgs = Schema.Struct({
  input: Schema.Struct({
    enabled: Schema.Boolean,
    port: PortNumber,
  }),
});

export const ItemIdArgs = Schema.Struct({
  itemId: Schema.String,
});

export const PersonnelIdArgs = Schema.Struct({
  personnelId: Schema.String,
});

export const LanguageArgs = Schema.Struct({
  language: LanguageSchema,
});

export const AuditMovementFilterArgs = Schema.Struct({
  filters: Schema.Struct({
    dateFrom: Schema.optional(Schema.String),
    dateTo: Schema.optional(Schema.String),
    movementType: Schema.optional(AuditMovementTypeSchema),
    itemId: Schema.optional(Schema.String),
    itemSearch: Schema.optional(Schema.String),
    performedBy: Schema.optional(Schema.String),
    textSearch: Schema.optional(Schema.String),
    page: PageNumber,
    pageSize: PageSize,
  }),
});

export const AuditAnalyticsFilterArgs = Schema.Struct({
  filters: Schema.Struct({
    dateFrom: Schema.optional(Schema.String),
    dateTo: Schema.optional(Schema.String),
    movementType: Schema.optional(AuditMovementTypeSchema),
    itemId: Schema.optional(Schema.String),
    itemSearch: Schema.optional(Schema.String),
    performedBy: Schema.optional(Schema.String),
    textSearch: Schema.optional(Schema.String),
  }),
});

// ─── HTTP Body Schemas (LAN router + dev API server) ─────────────────────────

export const CreateInventoryItemBody = Schema.Struct({
  sku: Schema.String,
  name: Schema.String,
  category: Schema.String,
  location: Schema.String,
  unit: Schema.String,
  supplier: Schema.String,
  reorderQuantity: NonNegativeInt,
  initialQuantity: NonNegativeInt,
});

export const UpdateInventoryItemBody = Schema.Struct({
  itemId: Schema.String,
  sku: Schema.String,
  name: Schema.String,
  category: Schema.String,
  location: Schema.String,
  unit: Schema.String,
  supplier: Schema.String,
  reorderQuantity: NonNegativeInt,
});

export const StockMutationBody = Schema.Struct({
  itemId: Schema.String,
  quantity: PositiveInt,
  reason: Schema.String,
  performedBy: Schema.String,
});

export const BatchIssueMaterialBody = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      itemId: Schema.String,
      quantity: Schema.Number,
    }),
  ),
  performedBy: Schema.String,
  reason: Schema.String,
});

export const UpdateBackupPlanBody = Schema.Struct({
  targetPath: Schema.String,
  intervalValue: NonNegativeInt,
  intervalUnit: BackupIntervalUnitSchema,
  onStartup: Schema.Boolean,
});

export const AddPersonnelBody = Schema.Struct({
  name: Schema.String,
});

export const UpdateLanguageBody = Schema.Struct({
  language: LanguageSchema,
});

export const PublicIssueBody = Schema.Struct({
  quantity: PositiveInt,
  reason: Schema.String,
  performedBy: Schema.String,
});

// ─── Transport Types ─────────────────────────────────────────────────────────

/** Serialized error sent across IPC or HTTP. */
export interface TransportError {
  readonly _tag: string;
  readonly message: string;
  readonly available?: number;
  readonly requested?: number;
  readonly language?: string;
}

/** IPC result envelope — never throw across Electron IPC. */
export type IpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: TransportError };
