# Changelog

All notable changes to OpenInventory will be documented in this file.

## [0.0.4] - 2026-03-31

### Changed
- Database lifecycle is now a scoped Effect resource that closes the connection on app shutdown via ManagedRuntime
- LAN server is a scoped Effect layer with Semaphore(1) serialization to prevent operation interleaving
- All 17 IPC handlers and HTTP endpoints validate input with @effect/schema decoders
- IPC error transport uses result envelopes ({ ok, data/error }) instead of thrown strings, preserving error type discriminants
- Numeric schema fields reject NaN, Infinity, and out-of-range values (quantities, ports, pagination)
- PublicIssueContext.item is now correctly nullable (was typed non-null but returned null for deleted items)
- HTTP error responses include _tag discriminant for typed error handling on the client

### Added
- src/shared/schemas.ts: centralized @effect/schema decoders for all IPC and HTTP boundaries
- serializeAppError preserves _tag, available, requested, and language fields across IPC transport
- GatewayError.errorTag property for renderer-side typed error branching
- E2E test verifying graceful shutdown releases the database connection
- 12 new backend tests: 10 schema decode-failure tests + 2 scoped lifecycle tests

### Fixed
- Electron IPC errors no longer prepend "Error: " to messages (result envelope bypasses Electron's error serialization)
- QR scan-to-issue flow handles deleted items gracefully instead of showing a blank screen

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
