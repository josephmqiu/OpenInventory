# TODOs

## Backup UI: Native directory picker

Replace `BackupPanel.tsx` text input with Electron's `dialog.showOpenDialog`
(native folder picker). Backend path validation was added in the Windows
hardening pass, but the UI still lets users type paths manually. The native
picker eliminates bad-path errors at the source.

**Why:** Windows users will mistype paths (wrong slashes, spaces, permissions).
The native picker prevents it entirely.

**Scope:** Full rebuild of BackupPanel including schedule UI and retention UX.

**Depends on:** IPC handler for `dialog.showOpenDialog` in main process, preload
bridge for the new channel.

**Files:** `src/renderer/src/ui/components/BackupPanel.tsx`, `src/main/ipc.ts`,
`src/preload/index.ts`

---

## Windows code signing

Set up Azure Trusted Signing or EV certificate for Windows builds. Currently
ships unsigned, triggering SmartScreen warnings ("Windows protected your PC").
Required for distribution beyond internal testing.

**Why:** Users see a scary warning and won't install. Azure Trusted Signing
eliminates SmartScreen warnings immediately (~$10/month).

**Depends on:** Azure account or certificate purchase. electron-builder supports
it via `win.azureSignOptions` config.

**Files:** `electron-builder.yml`, `.github/workflows/release.yml` (add signing
secrets)
