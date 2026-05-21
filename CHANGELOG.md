# Changelog

All notable changes to OpenInventory will be documented in this file.

## [Unreleased]

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
