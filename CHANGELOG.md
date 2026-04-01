# Changelog

All notable changes to OpenInventory will be documented in this file.

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
