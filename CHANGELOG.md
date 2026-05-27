# Changelog

All notable changes to OpenInventory will be documented in this file.

## [Unreleased]

## [0.2.0] - 2026-05-27

### Added
- New **Reports** tab — an executive Period Summary. Pick a month, quarter, half-year, or year and see the period's inventory movement value, received/issued/net value, and an inventory-health count, each with a prior-period change and a year-over-year comparison. Defaults to the last completed month so the headline numbers are never half-formed.
- The Reports tab shows a six-period trend of issued value, a "biggest movers" list (items whose issued value changed most versus the prior period), and Top Items / By Personnel breakdowns. Click any item to drill into its movement history for the period.
- Export a period report as a **multi-section CSV** (summary, top items, by personnel, alerts) or **print to PDF** with a clean, full-width document layout.
- Value figures are labeled "at current prices," and when items are missing a price the report says how many were excluded, so the numbers are never silently misleading.

### Fixed
- Print-to-PDF of a report now uses the full page width. It previously printed inside a narrow column with clipped cards and tables.

### Added
- Configurable columns now reach more of the app. The **Columns** menu (show/hide + drag-to-reorder) is available on the Alerts table, the Activity drill-down, the Activity summary views (By Personnel / By Item / Alert Frequency), and an item's Movement History. Each table remembers your layout per machine.
- Columns can now be reordered with the keyboard. The Columns menu has **Move left / Move right** buttons next to each column, so reordering no longer requires a mouse drag.

### Changed
- The Columns menu lists shown columns in their current on-screen order and names each Move button after its column, so it is clearer and works with a screen reader.

### For contributors
- `useTableColumns(persistKey, catalog, options?)` now returns ready-made `dataTableProps` and `menuProps` bundles, so a table opts into configurable columns with two prop spreads. `options` carries `{ sortState, onClearSort, resize }`; the menu's `onToggle` clears a stranded sort (resolving `sortKey`, client- or server-side) and `resize:false` omits the resize handles. `ColumnsMenu` now exports its props type and offers keyboard reorder; `ColumnDef` gained a `resizable?` flag (used to lock indicator columns like the Alerts severity stripe). Inventory + Activity Log were migrated onto the bundles with no behavior change, then the feature rolled out to four more tables. Dashboard widgets, Personnel, and Batch Issue were intentionally left out (glanceable readouts / workflow forms).

## [0.1.7] - 2026-05-25

### Added
- The inventory table is now yours to arrange. A **Columns** menu lets you show or hide columns (including ones that are off by default, like Category), and you can drag a column's right edge to resize it or drag its header to reorder it. Your layout is remembered on each machine, and a **Reset** returns to the shipped default.
- The Activity Log table gets the same Columns menu for showing/hiding and reordering its columns (resize isn't offered there yet).

### For contributors
- New `useTableColumns(persistKey, catalog)` hook owns per-table column state — visibility, order, and px widths — persisted to `localStorage["oi-table-cols:<key>"]` with guarded read/write (mirrors `useTheme`). `DataTable` stays presentational: it gained optional `onColumnReorder`/`onColumnResize` callbacks, a `<colgroup>` driven by `ColumnDef.width`, and per-`<th>` drag/resize affordances. Menu + persistence live in `UnifiedInventoryTable`/`AuditLogTable`, not in `DataTable`.
- Inventory column widths moved from CSS `.col-*` percentage classes to per-column px widths (`ColumnDef.defaultWidth` → colgroup). The now-dead `.col-*` rules were removed from `app.css`, and the master sort E2E specs were repointed from `th.col-qty`/`th.col-price` selectors to the sortable header button by text.
- This work was built earlier but orphaned: PRs #29/#30 merged into intermediate stacked branches instead of master, so it never reached v0.1.6. Recovered by cherry-picking onto current master.

## [0.1.6] - 2026-05-23

### Added
- You can now give each item an optional unit price and choose the app's currency (CNY, USD, EUR, or GBP). Prices appear in the inventory table and item details, formatted for your currency and language, and the price column sorts (items without a price sort to the end). Items priced in one currency keep their numbers if you switch currency — only the symbol changes.
- Prices are visible on the phone/QR lookup too, so someone scanning an item's code sees its current price alongside stock.

### Changed
- LAN access is now read-only. The phone/QR lookup shows item details (including price and stock) but can no longer issue stock — every stock change goes through the desktop app, so there's a single source of truth. In production the LAN server serves only the lookup page, never the admin interface.
- On startup, OpenInventory now takes a verified backup before applying any database schema change, and refuses to open a database created by a newer version of the app (a downgrade can't silently corrupt your data). If a database upgrade fails, it offers a one-click rollback to the pre-update backup and won't keep retrying the same failed upgrade on every launch. Old pre-update backups are pruned automatically, keeping the most recent few.

### Fixed
- Out-of-stock and low-stock labels in the inventory table are readable again — they render as colored text instead of an unreadable solid red block.

### Security
- Closed a flaw where an unauthenticated LAN request for a directory path (such as `/assets/`) could crash the app. Static file serving now returns a clean 404 for non-files, and rejects path-traversal attempts.

### For contributors
- New `unit_price_minor` column (migration v6) stores prices as integer minor units; an `app.currency` setting drives `Intl`-based formatting. Currency changes update optimistically and roll back if the write fails. `snapshotEquals` now compares `currency` so a switch re-formats prices live.
- Startup data-safety lives in `migrationSafety.ts` (verified pre-migration backup, downgrade guard via `schema_migrations` max version, rollback-marker loop guard, backup pruning), with unit + integration coverage.
- LAN hardening: removed the public stock-issue endpoints; `serveStaticFile` guards reads with `statSync().isFile()`; production routing restricted to the QR lookup.
- E2E suite optimization: Playwright worker count auto-derives from CPU count (CI fixed at 3); read-only specs converted to share one Electron instance per worker; a duplicated test removed; LAN ports/keys centralized in `e2e/fixtures/lan-constants.ts`; several silent-pass and fragile-cleanup issues fixed. New end-to-end coverage for item pricing + currency, LAN static-asset serving (including the directory-path DoS regression and path traversal), and the update-ready chip. The suite went from 92 tests / 116s to 103 tests / ~52s, 0 flaky locally. Migration-safety startup guards stay unit-covered (an E2E layer proved unreliable under Playwright's Electron). Fixed the inventory price column's missing width so its sort header is clickable.
- Release pipeline: R2 release uploads are ordered and verified for consumability before the release is activated.

## [0.1.5] - 2026-05-22

### Added
- A new **Update** section in Settings shows your current version, lets you check for updates on demand, and tells you plainly whether you're up to date, downloading, or ready to restart.

### Changed
- Redesigned the update experience: updates now download quietly in the background, and the only thing you act on is a small "Update ready — Restart" prompt in the top bar. No more manual download step or full-width banner.
- Updates now apply only when you choose Restart, so the verified pre-update backup always runs first (updates no longer install silently on quit).

### For contributors
- Replaced `UpdateBanner` with `UpdateChip` (ambient topbar prompt) + `UpdateSettingsPanel` (Settings tab); added `get-app-version` and `get-update-status` IPC, a dev-only browser simulator for exercising update states, and unit + E2E coverage for the new flow.

## [0.1.4] - 2026-05-21

### Added
- Your data is protected across app updates: before an update installs, OpenInventory creates a verified local backup you can roll back to. If that safety backup can't be created, the update is blocked rather than risking your database.
- If you've set a backup destination, OpenInventory also tries to back up there before updating — but a failure on that target won't block the update once the local safety backup exists.
- After updating, OpenInventory validates your database on first launch (integrity, foreign keys, required tables, schema version, and a real inventory load). If anything looks wrong, it stops and tells you to restore from a backup instead of opening with a broken database.
- Automatic updates now reach you: the app checks a hosted update server and downloads new versions in the background, so you no longer need to reinstall manually to stay current.

### For contributors
- Golden upgrade-path tests assert that databases from prior versions migrate without corrupting inventory balances, movement totals, alerts, or settings.
- Focused production-risk coverage gate (`scripts/check-focused-coverage.ts`, wired into `npm run test:coverage`) enforces per-file coverage minimums on database, migration, backup, and update code.
- CI moved from macOS to Windows — Windows is the production customer platform, Mac is dev-only. Fast checks, the test-suite matrix, coverage, and E2E now run on Windows; the Mac release build lane was removed.
- Hardened E2E inventory CRUD selectors so the Unit field no longer also matches "Unit Price".
- New ops docs: production release rule, Windows signing risk acceptance, and restore-drill checklist (`docs/production-operations.md`).
- Update delivery moved off the private GitHub repo (unreachable to clients) to Cloudflare R2 via electron-updater's `generic` provider. The release workflow now builds with `--publish never` and uploads installer, blockmap, and `latest.yml` to the `openinventory-releases` bucket with `wrangler` (auth via `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets).
- Raised backend Vitest `hookTimeout`/`testTimeout` so the migration-heavy DB setup in `beforeEach` no longer flakes against the 10s default on slow Windows CI runners.

## [0.1.1] - 2026-04-23

### Fixed
- Add try-catch to handle server close errors in LanServerService

## [0.0.4] - 2026-04-01

### Added
- Audit view: backend service, transport layer, and data access for audit log tracking
- Audit view UI with i18n, filter bar, log table, analytics panel, and drill-down detail view
- Audit routes added to dev API server for browser preview
- Collapsible sidebar with toggle button pinned to bottom
- Lucide React icon library — replaced all inline SVGs with Lucide icons in sidebar and navigation
- QR scan view split into separate entry point from desktop app
- Husky pre-push hook to run tests before pushing
- Reusable CI test-suite workflow; release builds gated on test passage
- Coverage reporting and critical path test coverage
- src/shared/schemas.ts: centralized @effect/schema decoders for all IPC and HTTP boundaries
- serializeAppError preserves _tag, available, requested, and language fields across IPC transport
- GatewayError.errorTag property for renderer-side typed error branching
- 21 backend audit service tests + extended seed helpers
- 5 Lucide React icon rendering tests + audit view E2E tests
- E2E test verifying graceful shutdown releases the database connection
- 12 schema decode-failure tests + 2 scoped lifecycle tests

### Changed
- Database lifecycle is now a scoped Effect resource with ManagedRuntime
- LAN server is a scoped Effect layer with Semaphore(1) serialization
- All 17 IPC handlers and HTTP endpoints validate input with @effect/schema decoders
- IPC error transport uses result envelopes ({ ok, data/error }) instead of thrown strings
- Numeric schema fields reject NaN, Infinity, and out-of-range values
- PublicIssueContext.item is now correctly nullable
- HTTP error responses include _tag discriminant for typed error handling
- Desktop minimum window size bumped to 1280×800
- Language selector replaced with icon toggle button
- Audit filter bar redesigned for tighter, cleaner layout

### Fixed
- Electron IPC errors no longer prepend "Error: " to messages
- QR scan-to-issue flow handles deleted items gracefully
- QR view button colors and CJK font weight
- Audit view dark mode styling and duplicate header removed

## [0.0.1] - 2026-03-31

### Added
- Auto-update system: the app checks for updates on launch and shows a non-intrusive banner when a new version is available
- GitHub Actions release workflow for macOS (x64 + arm64) and Windows (x64), triggered by version tags
- App icon (amber "OI" monogram on dark charcoal), auto-converted to .icns and .ico at build time
- Push event support in the preload bridge for real-time main-to-renderer communication
- Update banner UI with download progress, restart prompt, and error states (en + zh-CN)

### Changed
- Version reset to 0.0.1 as the first published release
- App ID changed from `com.local.inventory-monitor` to `com.openinventory.app`
- Product name changed from "Inventory Monitor" to "OpenInventory"
- electron-builder config now publishes to GitHub Releases with zip (mac auto-update) and NSIS (Windows) targets
- Added description, author, copyright, and macOS category metadata to package.json and electron-builder.yml
