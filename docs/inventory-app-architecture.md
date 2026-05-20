# OpenInventory Architecture

> This document describes the **current** architecture as built. An earlier
> version of this file described a Tauri 2 + Rust design that was the original
> plan; the app was migrated to Electron + TypeScript + Effect TS before release.
> This rewrite reflects what actually ships.

## 1. Product Goal

OpenInventory is a local-first desktop inventory tracker for a small team
operating from a single location. An admin runs the desktop app; floor workers
can issue stock from a tablet or phone over the LAN. It lets users:

- create and edit inventory items
- receive stock into inventory and issue material out
- see low-stock alerts when quantities drop to or below the reorder level
- review movement history and an audit log of every stock change
- back up and restore the local database
- expose a read-only LAN issue workflow via QR codes

All data lives in a single local SQLite file. The app runs offline; the LAN
server is optional.

## 2. Target Platform

- **Windows 10/11** — the production customer platform; the only target CI
  builds and publishes.
- **macOS** — development only. The app builds and runs on Mac locally, but CI
  no longer produces Mac release artifacts.

There is no Linux target.

## 3. Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron, electron-vite |
| Main process | TypeScript, Effect TS, better-sqlite3, Node.js `http` |
| Renderer | React 19, Vite, custom CSS (no UI framework) |
| Database | SQLite (single local file) |
| IPC | Electron `contextBridge` with a typed `invoke` API |
| Boundary validation | `@effect/schema` decoders (`src/shared/schemas.ts`) |
| Tests | Vitest (unit/integration), Playwright (E2E) |

## 4. Process Architecture

The app has three code surfaces:

1. **Main process** (`src/main/`) — owns the database, business logic, the LAN
   HTTP server, backups, and auto-update. Built as Effect TS services composed
   into a single `ManagedRuntime`.
2. **Preload** (`src/preload/`) — a `contextBridge` script exposing a typed
   `electronAPI.invoke(channel, args)` to the renderer. No Node access leaks
   into the renderer (`sandbox: true`, `contextIsolation: true`).
3. **Renderer** (`src/renderer/src/`) — the React UI. Talks to the backend
   through a gateway abstraction that routes either to IPC (desktop) or HTTP
   (LAN), so the same components work in both contexts.

### Service composition

Services are Effect Layers merged in `src/main/index.ts` and run under one
`ManagedRuntime` so the SQLite connection is memoized as a single resource:

```
DbLayer
  → DbAndNotifications (+ NotificationService)
    → CoreLayer (+ LanServer, scoped on DbLayer)
      → AppLayer (+ BackupService)
        → ManagedRuntime
```

### Main process services (`src/main/services/`)

- **DatabaseService** — the core read/mutation engine: items, movements,
  low-stock alerts, personnel, audit queries, language, and snapshot loading.
- **NotificationService** — OS desktop notifications for new low-stock alerts.
- **LanServerService** — lifecycle and state for the LAN HTTP server, access
  key generation/validation, and the public issue workflow.
- **BackupService** — executes a backup to a target directory (temp file +
  rename + manifest), runnable in parallel with the app.
- **BackupCoordinator** — orchestrates backup state, validation, restore (with
  relaunch), and the pre-update safety backup.
- **BackupScheduler** — fires automatic backups on the configured interval.
- **AutoUpdateService** — wraps `electron-updater`; checks, downloads, and
  installs updates, and runs a pre-install hook (the safety backup) before
  `quitAndInstall()`.
- **postUpdateValidation** — on first launch after a version change, validates
  the database (integrity, foreign keys, required tables, schema version) and
  fails closed if anything is wrong.
- **restorePending** — applies `.restore-pending.json` after a restore so
  settings survive the relaunch.

QR URL generation is a closure built in `index.ts` (it reads the live LAN URL),
not a standalone service.

## 5. IPC Layer

`src/main/ipc.ts` registers ~40 handlers via `ipcMain.handle()`. Write handlers
go through a shared `handleMutation()` helper that: decodes args with an
`@effect/schema` decoder, runs the DatabaseService mutation, checks whether the
change opened a new low-stock alert, and returns the fresh snapshot plus any
notification. All input crossing the IPC and HTTP boundaries is decoded with
schemas from `src/shared/schemas.ts`; decode failures become typed errors.

Handler groups: health/snapshot, item CRUD, stock receive/issue (single and
batch), movement read + delete, audit reads, personnel add/remove, backup
(now/validate/restore/pick-directory), QR label export, LAN access
(state/update/regenerate-key), language, and auto-update
(check/download/install).

## 6. Database

Schema lives in `src/main/infrastructure/schema.sql` and is applied on every
startup; migrations in `src/main/infrastructure/migrations.ts` then bring the
file up to the latest version.

### Tables (as built)

- `inventory_items`
- `inventory_movements` (immutable ledger of receive/issue events)
- `low_stock_alerts`
- `personnel`
- `locations` — table exists with FK from items; **no management UI**
- `suppliers` — table exists with FK from items; **no management UI**
- `app_settings` (key/value)
- `schema_migrations`

The original plan's `refill_orders`, `refill_order_lines`, `audit_logs`,
`users`, and `outbox_notifications` tables are **not** part of the shipped
schema (`audit_logs` was dropped in migration v2; refill/PO tables were never
created). `locations` and `suppliers` remain as referenced-but-unmanaged
remnants of the original design.

### Migrations

A small versioned runner applies forward migrations and records each in
`schema_migrations`:

- **v1** baseline schema
- **v2** dropped dead columns, dropped `audit_logs`, added indexes
- **v3** added movement indexes (`performed_at`, `movement_type`, `performed_by`)
- **v4** migrated freeform `backup.schedule` to structured
  `backup.interval_value` / `backup.interval_unit`
- **v5** dropped `low_stock_alerts.channel_summary`

### Data rules

- `PRAGMA foreign_keys = ON` per connection; `integrity_check` runs at startup.
- Every quantity change writes a movement row; the latest quantity is also
  snapshotted on `inventory_items.current_quantity` for fast table rendering.
- Stock mutations run inside a transaction.
- Low-stock alerts open at/below the reorder level and resolve above it;
  duplicate open alerts for one item are prevented.

## 7. LAN Server

`src/main/infrastructure/lan/` runs a Node `http` server (no Express) that
serves the React SPA (from the unpacked asar) and a JSON API.

- **Auth:** a 24-char base64url access key sent as `x-inventory-key`, compared
  in constant time. Five failed attempts from an IP trigger a 15-minute
  lockout.
- **Public routes (no auth):** fetch an item's issue context and submit an
  issue — this is the QR-scan workflow a floor worker uses.
- **Authenticated routes:** full snapshot, item issue, batch issue, movement
  history, audit movements/analytics, health.
- **Read-only by design:** item CRUD, personnel, receive, language, and backup
  are desktop-only (IPC). The LAN API never exposes destructive mutations
  beyond issuing stock, to keep the blast radius small.

## 8. Renderer

`src/renderer/src/` is organized as:

- **app/** — `App.tsx` (4-tab shell: Dashboard, Inventory, Activity, Settings),
  `useInventoryState` (polling state manager), `useAutoUpdate`, `useTheme`,
  `i18nResources` (en + zh-CN), runtime detection (desktop vs LAN).
- **domain/** — TypeScript models shared via `src/shared/types.ts`.
- **services/** — `inventoryGateway.ts`, the abstraction that routes each call
  to `window.electronAPI.invoke()` (desktop) or `fetch()` (LAN).
- **ui/components/** — the panels and tables (DashboardView,
  UnifiedInventoryTable, ActionPanel, BatchIssuePanel, ItemDetailsPanel,
  PersonnelPanel, BackupPanel, LanAccessPanel, the Audit* views, plus modals
  and shared primitives like DataTable and MetricCard).
- **ui/printing/**, **ui/export/** — QR label rendering (canvas → PNG) and CSV
  helpers.
- **issue/** — a separate entry point (`issue-main.tsx`) for `QuickIssuePage`,
  the unauthenticated QR-scan issue form served over the LAN.

The renderer polls the backend every few seconds; `snapshotEquals()` keeps
references stable when nothing changed so React skips re-renders.

## 9. Update & Backup Safety

Reliability around updates is a first-class concern (see
`docs/production-operations.md`):

- Before an update installs, BackupCoordinator creates a **verified local
  safety backup**. If it fails, the install is aborted.
- If a backup target is configured, that backup is also attempted, but a
  failure there does not block the update once the local safety copy exists.
- On first launch of a new version, postUpdateValidation runs integrity,
  foreign-key, required-table, and schema-version checks plus a real snapshot
  load. On failure the app stops and directs the operator to restore.
- Golden upgrade-path tests assert prior-version databases migrate without
  corrupting balances, movement totals, alerts, or settings.

## 10. Localization

The UI supports English and Simplified Chinese (zh-CN) through an i18next layer
with the ICU plugin (single-brace interpolation). All labels, tables, forms,
dialogs, and errors are translatable; item data (names, categories, notes) is
stored as UTF-8 and is language-independent.

## 11. Build & Test

- `npm run dev` — Electron dev with HMR (rebuilds the Electron native ABI
  first).
- `npm run verify` — lint + Vitest (frontend + backend).
- `npm run test:coverage` — coverage plus a focused production-risk coverage
  gate (`scripts/check-focused-coverage.ts`) over database, migration, backup,
  and update code.
- `npm run test:e2e` — Playwright against a real Electron instance with an
  isolated temp database.

Native modules (better-sqlite3, @parcel/watcher, msgpackr-extract) compile to a
specific ABI; wrapper scripts swap between the Node ABI (Vitest) and the
Electron ABI (dev/E2E/packaged) — see `CLAUDE.md` for the rules.

## 12. Not Implemented

The following appeared in the original plan but are **not** part of the shipped
product: refill/purchase orders, supplier management UI, multi-location stock
segregation, user accounts / role-based permissions, email/SMS/webhook
notification channels, and CSV/Excel/PDF export. Stock-count adjustments are
not a dedicated workflow (movements carry a free-text `reason`). Some of these
remain as deferred ideas in `TODOS.md`.

## Sources

- Electron: https://www.electronjs.org/docs/latest
- Effect TS: https://effect.website/
- React 19: https://react.dev/blog/2024/12/05/react-19
- Vite: https://vite.dev/guide/
- Vitest: https://vitest.dev/guide/index.html
- Playwright: https://playwright.dev/docs/intro
- SQLite: https://www.sqlite.org/
- SQLite foreign keys: https://sqlite.org/foreignkeys.html
