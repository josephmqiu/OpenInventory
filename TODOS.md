# TODOs

## Item pricing — deferred follow-ups (from /autoplan, 2026-05-22)

Deferred out of the v1 item-price feature (optional per-item price + app currency
setting). Each was an explicit out-of-scope decision, not an oversight:

- **0-decimal / non-2-decimal currencies (JPY, KRW, BHD).** v1's currency picker
  offers 2-decimal currencies only, to avoid the cross-exponent rescale bug. Adding
  these needs rescale-on-switch logic (`stored ×10^Δexponent`) + a USD↔JPY test.
- **Sell price.** Cost/value only for now. Sales/invoicing is a separate module.
- **Per-item currency + FX conversion.** One currency per app is the deliberate model.
- **Price history / per-receipt cost / COGS / weighted-average / FIFO.** Explicitly out
  — this is an inventory app, not a costing app. A separate effort if ever needed.
- **CSV price import.** v1 is manual per-item entry.
- **Price-edit audit log.** Changing a price isn't recorded as a movement.
- **AI cost insights.** Cloud/SaaS phase.

Reviewed plan: `~/.gstack/projects/josephmqiu-OpenInventory/joe-pricing-plan-fresh-20260522.md`

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

---

## IPC: Add handleQuery() helper for read-only handlers

18+ read-only IPC handlers in `ipc.ts` repeat the same try-catch-decode-run-fail
boilerplate (~7 lines each, ~126 lines total). The codebase already has
`handleMutation()` for write handlers, but nothing equivalent for reads.

**Why:** Any change to error handling, logging, or response shape for read
handlers requires editing 18+ handlers individually. A `handleQuery()` helper
would mirror `handleMutation()` and reduce each handler to a one-liner.

**Scope:** Extract helper, refactor existing read-only handlers to use it.

**Depends on:** Nothing. Can be done independently.

**Files:** `src/main/ipc.ts`

---

## UI: Extract PanelLayout component

10+ panel components repeat the same `<section className="panel">` /
`panel__header` / `panel__actions` / footer structure (~15-25 lines each,
~150 lines total). A `<PanelLayout>` component would standardize this.

**Why:** Any visual change to the panel shell (header layout, spacing, footer
alignment) requires editing 10+ files. A shared component would make panel
styling changes one-file updates.

**Scope:** Create PanelLayout, refactor existing panels to use it.

**Depends on:** Nothing. Can be done independently.

**Files:** `src/renderer/src/ui/components/BackupPanel.tsx`,
`src/renderer/src/ui/components/LanAccessPanel.tsx`,
`src/renderer/src/ui/components/PersonnelPanel.tsx`,
`src/renderer/src/ui/components/ActionPanel.tsx`,
`src/renderer/src/ui/components/ItemDetailsPanel.tsx`,
`src/renderer/src/ui/components/AlertsPanel.tsx`,
`src/renderer/src/ui/components/BatchIssuePanel.tsx`, and others

---

## UI: Extract ConfirmAction component

The confirm-before-delete pattern (confirmId state + Confirm/Cancel buttons)
is duplicated in PersonnelPanel and ActionPanel (~20-30 lines each). A
`<ConfirmAction>` component would encapsulate this.

**Why:** Adding confirmation dialogs to new delete/remove actions means
copy-pasting the state + button pattern. A reusable component eliminates this.

**Scope:** Small. Create component, refactor 2 existing usages.

**Depends on:** Nothing. Can be done independently.

**Files:** `src/renderer/src/ui/components/PersonnelPanel.tsx`,
`src/renderer/src/ui/components/ActionPanel.tsx`

---

## IPC: Extract dialog/file-picker helper

4 IPC handlers in `ipc.ts` repeat the same showOpenDialog/showSaveDialog
try-catch pattern (~17 lines each, ~68 lines total). A `showFilePicker()`
helper would reduce each to a one-liner.

**Why:** The pattern includes BrowserWindow focus check, dialog options,
cancel handling, and error wrapping. Any change to dialog behavior requires
editing 4 places.

**Scope:** Small. Extract helper, refactor 4 handlers.

**Depends on:** Nothing. Can be done independently. Partially overlaps with
the "Backup UI: Native directory picker" TODO above.

**Files:** `src/main/ipc.ts`

---

## LAN: Role-based access (admin vs operator keys)

The LAN server currently uses a single shared access key for all authenticated
endpoints. In the production hardening pass, write endpoints (create/update/delete
items, manage personnel) were removed from the LAN API to reduce blast radius.
For V2, consider supporting two key types: an admin key (full access) and an
operator key (read + issue only).

**Why:** As the team grows, the admin may want to give floor workers LAN access
without granting the ability to modify inventory data. A single shared key means
all-or-nothing access.

**Scope:** Medium. Add a key_type field to app_settings, second key generation,
route-level permission checks in the LAN router.

**Depends on:** Nothing. Can be done independently.

**Files:** `src/main/infrastructure/lan/auth.ts`, `src/main/infrastructure/lan/router.ts`,
`src/main/services/LanServerService.ts`, `src/main/services/DatabaseService.ts`

---

## Backup: Prune pre-update safety backups

`BackupCoordinator.createPreUpdateSafetyBackup()` writes a verified local backup
to `pre-update-backups/<version>-<timestamp>/` before every app update, but
nothing ever deletes them. They accumulate on disk indefinitely — one full
database copy per update.

**Why:** Over many updates this is unbounded disk growth in the app data
directory. The configured backup target already has retention; these safety
backups don't. A long-lived install could end up with dozens of stale copies.

**Scope:** Small. After post-update validation succeeds (the update is known
good), sweep `pre-update-backups/` keeping the last N (e.g. 3). Do the prune
only after the success mark so a failed/rolled-back update keeps its rollback
point.

**Depends on:** Nothing. Hooks into the existing post-update validation success
path in `src/main/index.ts`.

**Files:** `src/main/services/BackupCoordinator.ts`, `src/main/index.ts`


---

## Update UI: collapse the ambient restart chip at narrow widths

**What:** Below a topbar width threshold (DESIGN.md tightens the topbar at
<1200px; min window is 900px), collapse the "Update ready · Restart · ×" chip to
just the amber dot + Restart button, dropping the "Update ready" label.

**Why:** At narrow widths the full chip plus the page title and the theme +
language icon buttons can crowd the topbar. The label is the most expendable
part — the amber dot still signals state and the Restart button keeps the action.

**Scope:** Small. CSS-only — hide `.update-chip__label` under a media/container
width condition once the real chip component lands. Threshold TBD during
implementation (test at 900px with a long page title).

**Depends on:** The Update UI chip being implemented (see the locked design in
`src/renderer/update-ui-mockup.html`).

**Files:** the new update chip component + `src/renderer/src/app/app.css`.
