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

---

## E2E: dynamic LAN port allocation (Windows CI robustness)

**What:** Replace the fixed per-scenario LAN ports (19877-19883) with OS-assigned
(`port 0`) or worker-index-derived ports for E2E seeds, and have the test read the
app's actually-bound port instead of hard-coding it.

**Why:** On `windows-latest` (the only production CI target) with parallel workers +
Playwright retries, a retried project re-binding its fixed port can hit a lingering
socket (TIME_WAIT). Surfaced by Codex during the /plan-eng-review of the E2E
optimization PR. Ports are currently unique-per-project, so cross-worker collision
can't happen today — this hardens the retry edge only.

**Pros:** Eliminates the port-bind flake class on the production CI platform.
**Cons:** Non-trivial — the LAN port is written into the seeded DB at seed time and
consumed by the app's LAN server; OS-assigned ports require the app to surface the
chosen port back to the test (the app already logs LAN URLs, so a hook exists).

**Context:** Deferred out of the E2E optimization PR (2026-05-23) as out-of-proportion
to a test-optimization change. Revisit if Windows CI shows intermittent port-bind
failures. Start at `e2e/scripts/generate-seeds.ts` (seedLanFixture) and the new
`e2e/fixtures/lan-constants.ts`.

**Depends on:** App surfacing its bound LAN port to tests (currently fixed via seed).

**Files:** `e2e/scripts/generate-seeds.ts`, `e2e/fixtures/lan-constants.ts`, LAN specs,
`src/main/services/LanServerService.ts` (port reporting).

---

## Deferred from /autoplan (configurable-columns rollout, 2026-05-26)

### Presets / table-density toggles (alternative to per-table column menus)
**Why deferred:** Both CEO voices flagged "per-table column config on everything" as
mistaking consistency for quality. A "compact / full" density toggle or a single
"show optional fields" control may serve a 1-2 person admin better than nine separate
Columns menus. Larger UX paradigm — not this plan.
**Revisit if:** users actually ask to reshape tables, or column-config usage data shows
real adoption on the shipped surfaces.

### Dashboard widgets + Personnel + Batch Issue column config — DROPPED, not deferred
Dashboard Top Movers / Recent Alerts (5-row glanceable readouts), Personnel (2 structural
columns → degenerate menu), Batch Issue (workflow form). Excluded by design intent
(DESIGN.md "the table is the hero" / "instrument panel"). Only revisit with explicit demand.

### Resize on Activity Log
Shipped deliberately without resize in v0.1.7. Not re-enabled. Revisit only on a real
complaint about column widths there.

### Keyboard-accessible column reorder (a11y)
Drag-to-reorder is mouse-only native HTML5 drag (pre-existing on the 2 shipped tables).
Both design voices flagged it as undiscoverable + keyboard-dead. Candidate fix: add a
drag-handle/grip + "Move left/right" keyboard actions inside `ColumnsMenu` (benefits all
tables). May fold into the refactor PR (final-gate taste call) or ship as a follow-up a11y PR.
**Files:** `ColumnsMenu.tsx`, `DataTable.tsx` (th drag affordance), `app.css` (~920-955).

## Mobile LAN browse + search (v? — feat/mobile-lan-browse-search) follow-ups
Deferred during /autoplan review of the read-only mobile catalog browse/search feature.

### Pinyin / fuzzy / partial-Chinese / barcode search
v1 search is exact substring on name/SKU/location (mirrors the desktop table via
`src/renderer/src/domain/itemFilter.ts`). China-first floor workers often search by pinyin,
abbreviations, or barcode. Add a normalization/alias layer in `filterInventoryItems` (benefits
the desktop table too). **Revisit when:** workers report search "not finding" Chinese items.

### Large-catalog rendering (debounce / windowing)
`QuickItemList` filters with `useMemo` and renders every matching row. Fine for SMB scale
(tens–low hundreds). At thousands of items on weak phones, add `useDeferredValue`/debounce on
search + windowed rendering. **Revisit when:** a customer catalog exceeds ~1k items.

### Public-route cache / rate-limit (autoplan T1 — deferred)
`GET /public/items` (and `/public/items/:id/context`) are intentionally unauthenticated and
unthrottled on the trusted LAN. Codex flagged repeated-read DoS; deferred (matches existing
public route, read-only). Cheap fast-follow if refresh-spam shows up: a 1–2s in-memory cache
in `src/main/infrastructure/lan/router.ts` and/or a per-IP limit on public routes.

### Remove the single-item fallback path (post-bake cleanup)
`useQuickIssueState` + `loadPublicItemContext` are kept as a catalog-load-failure fallback in
`QuickIssueApp`. Once the catalog path has shipped one stable release, consider collapsing to
the catalog-only path. **Revisit after:** one release with no catalog-load incidents.

---

## Reports / Period Summary — deferred follow-ups (from /autoplan + reviews, 2026-05-27)

Deferred out of the v1 "Reports" (Period Summary) tab. Each was an explicit
out-of-scope decision during the CEO/Design/Eng reviews, not an oversight:

- **Multi-sheet Excel export (exceljs).** v1 ships a multi-section CSV (reusing the
  existing `buildAuditCsvContent` Blob-download pattern) + print-to-PDF. Excel opens
  CSV natively. Revisit only if admins need a formatted multi-tab `.xlsx` workbook;
  adding `exceljs` (~1MB) and its packaging/test surface wasn't justified for v1.
- **Opening/closing inventory balances ("period close").** The report shows net change
  and movement value, not beginning/ending stock per period. Full balance reconstruction
  from movement history (with no-movement and deleted-movement edge cases) is the v1.1
  upgrade that turns this from a period *summary* into a period *close*.
- **Point-in-time price capture on movements.** Value uses **current** item prices
  (labeled "at current prices"), so a closed period's figures can change if a price is
  later edited. A stable `unit_price_at_movement` column on `inventory_movements` +
  price-change logging is the path to a true (reproducible) audit artifact.
- **Reviewed-by / notes sign-off line on the printed report.** An exec sign-off field on
  the print/PDF artifact. Pairs naturally with point-in-time pricing above.

**Plan:** `~/.claude/plans/mutable-baking-rose.md` · CEO plan:
`~/.gstack/projects/josephmqiu-OpenInventory/ceo-plans/2026-05-27-reports-period-summary.md`

### Code-quality follow-ups (from /review specialists, 2026-05-27) — P3

All informational, no correctness/security issues. Deferred to keep the feature PR focused:

- **Reuse `DataTable` in `PeriodReportPanel`.** The panel hand-rolls three raw
  `<table className="data-table">` blocks (biggest movers, top items, by-personnel) +
  a parallel `.data-table__row--clickable` CSS class instead of the shared `DataTable`
  component (columns/rowKey/onRowClick/empty-state). Reuse-before-rebuild gap.
- **Extract a shared CSV-download util.** `downloadCsv` + `csvRow` in `PeriodReportPanel`
  duplicate the Blob/`createObjectURL`/escape pattern in `AuditLogTable.tsx`; the
  "reuses the pattern" comment is aspirational. Extract `escapeCsvCell` + `triggerCsvDownload`.
- **Extract a shared `parseAuditReportPeriod(searchParams)` helper.** The 13-line decode
  block is duplicated verbatim in `lan/router.ts` and `scripts/dev-api-server.ts` — the exact
  dual-wiring drift the project memory warns about.
- **Dedup period arithmetic in `PeriodReportPanel`.** `lastCompletedPeriod` re-derives
  per-granularity modular math that `shiftPeriod` already owns; `maxIndex` duplicates the
  module-private `UNITS_PER_YEAR`. Export the table + derive from `shiftPeriod`.
- **Index `low_stock_alerts.triggered_at`.** The report's inventory-health + alert-frequency
  queries range-scan `triggered_at`, which has no index (only `(item_id, status)`). Low impact
  at typical alert volumes on local single-user SQLite, but a newly-exercised scan path.
- **Test-hardening:** direct unit tests for `lastCompletedPeriod` year-boundary rollover
  (faked clock), `biggestMovers` delta=0 exclusion + top-5 cap, the LAN missing-`index`
  default for non-year granularities, and per-granularity `shiftPeriod` symmetry.
  (`pctDelta` is now directly tested.)
