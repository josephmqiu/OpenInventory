# Changelog

All notable changes to OpenInventory will be documented in this file.

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
