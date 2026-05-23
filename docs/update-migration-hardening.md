# Update & Migration Hardening — Forward Plan (from v0.1.5)

Companion to `production-hardening-todo.md` (whose "Phase 1 — Update Safety" is
done). This doc covers the **next** layer of hardening for the update + schema
migration path, written after a full trace of the current flow on 2026-05-22.

## Deployment context (2026-05-22)

**One** deployed machine, now manually updated to v0.1.5. No machines remain on
pre-0.1.1 builds. From here, **every** update flows through the R2 auto-update
path — the manual-reinstall and hand-carried-exe scenarios are behind us.

This sharpens priorities: the integrity of the **R2 release pipeline** is now the
single point of failure for the one production machine. The field-specific guards
(manual-reinstall backup, older-binary downgrade) drop from "do first" to
"defense-in-depth," because the only path that exercises them is a mistake nobody
is currently positioned to make. They're still worth doing before the user base
grows past one machine — just not urgent.

## What already exists (do NOT rebuild)

The safety net is solid for the **auto-update path** (v0.1.1+ machines pulling
from R2):

- **Verified pre-update backup, abort-on-failure.** `installUpdate` →
  `prepareInstall` → `BackupCoordinator.prepareForUpdateInstall` writes a verified
  backup to `%APPDATA%/OpenInventory/data/pre-update-backups/<version>-<ts>/` and
  the install is aborted (no `quitAndInstall`) if that backup can't be created.
  (`AutoUpdateService.ts:147`, `BackupCoordinator.ts:125`)
- **WAL-safe snapshots.** Backups use SQLite's online backup API (`source.backup()`,
  `BackupService.ts:167`), not a raw file copy — no torn WAL state.
- **Forward-only, transactional, idempotent migrations.** Each migration runs in
  its own transaction; column ops use `IF EXISTS` / `IF NOT EXISTS`.
  (`migrations.ts:171`)
- **Fail-closed post-update validation.** On first launch of a new version:
  integrity check, `foreign_key_check`, required-tables present, schema version ==
  `LATEST_MIGRATION_VERSION`, plus a real `loadSnapshot()` smoke test. Any failure
  → error dialog + `app.exit(1)`. (`postUpdateValidation.ts`, `index.ts:190`)
- **Restore rejects future-schema backups.** (`BackupService.ts:230`)
- **Test coverage at the seam.** `upgrade-path-golden.test.ts` asserts business
  *values*, row counts, and settings transformation survive the legacy→latest
  chain; `migrations.test.ts` covers fresh-DB, idempotent re-run, child-row safety,
  and v4 schedule conversions.

## Open gaps — prioritized

> Re-ranked 2026-05-22 for the single-machine, auto-update-only reality (see
> Deployment context). The R2 pipeline is now the dominant risk; the
> field-specific guards are demoted to defense-in-depth.

### P0 — the auto-update path is now the only path; protect it

**3. R2 upload order is not pinned.** `release.yml:47` globs `latest.yml` + `.exe`
+ `.blockmap` and uploads in directory-sort order. Case-insensitive sort puts
`latest.yml` (`l`) *before* `OpenInventory-…​.exe` (`o`) — so the activation
pointer likely uploads **first**. The one production machine polls R2 every launch;
if it polls during that window it gets a manifest pointing at an exe that 404s.
This is the highest-leverage fix: cheap, concrete, and it guards the sole update
path the fleet now depends on.

> Fix: upload `.exe` + `.exe.blockmap` first, then `latest.yml` **explicitly last**
> as a separate step. `latest.yml` is the pointer that activates the release.

### P1 — defense-in-depth before the user base grows past one machine

**1. The pre-update backup is bolted to the update *button*, not the *migration*.**
Any path that runs migrations *without* going through `installUpdate` — a
sideloaded exe, a crash-relaunch — runs `runPendingMigrations` with **no automatic
snapshot**. Less urgent now that the live machine takes the auto-update path (which
*does* back up first), but the rollback point should still be intrinsic to the
schema change, not the UI flow.

> Fix: in `initializeDatabase` (`index.ts:86`), before `runPendingMigrations`,
> detect `currentVersion(db) < LATEST_MIGRATION_VERSION`; if so, take a verified
> safety backup (reuse `createPreUpdateSafetyBackup`-style logic, but it must work
> without the Effect runtime since it's pre-runtime — extract a thin
> `backup-before-migrate` helper). Abort startup with a clear dialog if the
> pre-migration backup fails, same fail-closed posture as the install path.

**2. No downgrade guard on the *live* DB open.** Restore rejects a future-schema
backup, but `initializeDatabase` will happily open and write a DB whose
`currentVersion > LATEST_MIGRATION_VERSION` (i.e. an *older* binary opening data
last touched by a *newer* version). Cheap insurance, but the only way to trigger it
now is to deliberately sideload an older exe — which the auto-update-only workflow
shouldn't produce. Worth adding alongside #1 since both are one edit to
`initializeDatabase`.

> Fix: in `initializeDatabase`, after `ensureMigrationsTable`, if
> `currentVersion(db) > LATEST_MIGRATION_VERSION` → error dialog ("This data was
> created by a newer version of OpenInventory. Install the latest version.") +
> `app.exit(1)`. Mirror the message already used at `BackupService.ts:233`.

**3. R2 upload order is not pinned.** `release.yml:47` globs `latest.yml` + `.exe`
+ `.blockmap` and uploads in directory-sort order. Case-insensitive sort puts
`latest.yml` (`l`) *before* `OpenInventory-…​.exe` (`o`) — so the activation
pointer likely uploads **first**. A client polling in that window gets a manifest
pointing at an exe that 404s.

> Fix: upload `.exe` + `.exe.blockmap` first, then `latest.yml` **explicitly last**
> as a separate step. `latest.yml` is the pointer that activates the release.

### P1 — next

**4. User-confirmed rollback on validation failure.** Today a failed post-update
validation → `app.exit(1)`, and an operator must manually restore. A verified
pre-update backup already sits at a known path. Offer a one-click restore.

> Fix: on `postUpdateCheck.errors` (or the `loadSnapshot` catch at `index.ts:246`),
> locate the newest matching `pre-update-backups/<version>-*` dir and show a modal:
> "Update validation failed: <errors>. A verified backup from before the update
> exists. Restore now?" → drive the existing `restoreFromBackup` path. **Confirmed,
> not automatic** — silent restore can mask recurring disk corruption and erase
> work done just before the update.

**5. Fresh-install schema ≡ fully-migrated schema equivalence test.** The current
design has two sources of truth: `schema.sql` (latest baseline for fresh DBs) and
`migrations.ts` (transforms for existing DBs). Nothing asserts they converge.

> Fix: add a test that builds DB-A from `schema.sql` and DB-B by running the full
> migration chain from a legacy seed, then diffs `sqlite_master` (and
> `pragma_table_info` per table). Catches `schema.sql`/`migrations.ts` drift before
> it ships.

**6. Migration discipline (doc-only convention).** Prefer **additive** migrations.
Stage destructive changes across two releases: release N stops writing the
column/table; release N+1 drops it after a soak. Avoids the "v0.1.6 dropped a
column and now we must roll the whole fleet back" scenario. Add this rule to
`CLAUDE.md` or a `migrations` header comment. Also: **never renumber or delete a
shipped migration** — offline machines may jump many versions and must replay the
full chain.

### P2 — when justified

**7. Prune `pre-update-backups/` to the last N (e.g. 3).** Each update/migration
writes a new dir; long-lived field machines accumulate them. Prune oldest after a
successful post-update validation.

**8. Code-sign the Windows installer.** Currently a documented accepted risk
(`production-hardening-todo.md` Phase 3). It's the real integrity guarantee for the
update feed — without it, anyone who can write the R2 bucket can also rewrite
`latest.yml` to match a tampered exe. Revisit when there's a signing cert.

## Explicitly dropped

- **"Wrap all migrations in one outer transaction."** Doesn't help: if the batch
  rolls back to the old schema, the already-installed *new* binary fails validation
  anyway (schema != LATEST) — same end state as landing on an intermediate version.
  The real protection for partial failure is the pre-migration backup (#1) +
  confirmed rollback (#4). Per-migration transactions stay as-is.

---

# Implementation Plan

Confirmed premises (2026-05-22): one field machine, fully on the R2 auto-update
path. The R2 release pipeline is the single point of failure → P0. The
field-specific guards are defense-in-depth for growth past one machine → P1.

## In scope

| # | Change | Priority | File(s) | Why now |
|---|--------|----------|---------|---------|
| C1 | Pin R2 upload order: artifacts first, `latest.yml` last | **P0** | `.github/workflows/release.yml` | Guards the only update path the live machine has |
| C2 | Pre-migration safety backup + downgrade guard in `initializeDatabase` | P1 | `src/main/index.ts` (+ helper) | Rollback point intrinsic to schema change, not the update button |
| C3 | User-confirmed rollback on post-update validation failure | P1 | `src/main/index.ts` | A verified backup already exists; offer one-click restore instead of bricking |
| C4 | Fresh-install ≡ fully-migrated schema equivalence test | P1 | `test/integration/migrations.test.ts` | Catches `schema.sql`/`migrations.ts` drift before ship |
| C5 | Migration discipline convention (additive; stage destructive over two releases) | P1 | `CLAUDE.md` + `migrations.ts` header | Prevents future fleet-rollback pain |
| C6 | Prune `pre-update-backups/` to last N after successful validation | P2 | `src/main/index.ts` / BackupCoordinator | Bounds disk growth on long-lived machines |

## Out of scope (deferred to TODOS.md)

- Code-signing the Windows installer (already a dated accepted risk; revisit when a cert exists).
- Release channel / canary rollout (no operational justification at one machine).
- Full `integrity_check` (no-arg) on the update boundary vs the current single-page check.
- **R2 retention + endpoint** (deferred 2026-05-22, agreed not now): bucket
  `openinventory-releases` accumulates one exe+blockmap per version forever; the
  updater only ever needs the latest (differential download uses the *local* old
  file, not server history). Feed is served off the rate-limited `pub-*.r2.dev` dev
  endpoint. Both fine at one machine. **Trigger to revisit — before scaling past a
  small pilot:** (a) prune R2 to the newest 3–5 versions in `release.yml` after a
  successful publish (never delete the version `latest.yml` points at; keep ≥1 prior
  for rollback); (b) move off `r2.dev` via a ~15-line Cloudflare Worker on a free
  `*.workers.dev` subdomain (no domain purchase), which also gives `Cache-Control`
  over `latest.yml`.

## Concrete changes

### C1 — R2 upload ordering (`release.yml:47`)
Today: a single loop over `Get-ChildItem` matching `latest.yml` + `.exe` +
`.blockmap` uploads in case-insensitive sort order, which places `latest.yml`
(the activation pointer) **first**. Fix: two explicit steps —
1. Upload `*.exe` and `*.exe.blockmap` (the payload).
2. Upload `latest.yml` **last**, as a separate step, with a comment: "latest.yml
   is the release activation pointer — must upload after its artifacts exist."
Keep the existing per-file `$LASTEXITCODE` throw so a failed payload upload aborts
before the pointer is written.

### C2 — Pre-migration backup + downgrade guard (`initializeDatabase`, `index.ts:86`)
- **Downgrade guard:** after `ensureMigrationsTable`, read `currentVersion(db)`. If
  `> LATEST_MIGRATION_VERSION` → error dialog ("data created by a newer version")
  + `app.exit(1)`. Mirrors the message at `BackupService.ts:233`.
- **Pre-migration backup:** if the DB file pre-existed at startup AND
  `0 < currentVersion(db) < LATEST_MIGRATION_VERSION`, take a verified backup
  before `runPendingMigrations`. Open question for review: the existing
  `createPreUpdateSafetyBackup` runs through the Effect runtime, which does not
  exist this early in boot. Proposed: a thin runtime-free helper using
  better-sqlite3's online backup API (`db.backup(path)`), writing to the same
  `pre-update-backups/<version>-<ts>/` convention. Abort startup with a dialog if
  the backup fails (same fail-closed posture as the install path).
  - Skip when the DB is brand-new (`currentVersion == 0` and no pre-existing file)
    — nothing to protect.

### C3 — Confirmed rollback (`index.ts:190` and `:246`)
On `postUpdateCheck.errors` or the `loadSnapshot` catch, locate the newest
`pre-update-backups/<previousVersion>-*` dir and show `dialog.showMessageBox`
with "Restore now / Quit". On Restore, drive the existing
`BackupCoordinator.restoreFromBackup` path (writes `.restore-pending.json`,
disposes runtime, swaps files, relaunches). **Sequencing wrinkle for review:** the
first validation point (`:190`) runs *before* the runtime/BackupCoordinator exist
(`:237`/`:274`). Options: (a) move the rollback offer to after coordinator
creation; (b) build a minimal runtime-free restore. Lean (a).

### C4 — Schema equivalence test (`migrations.test.ts`)
Build DB-A from `schema.sql`; build DB-B by seeding a legacy DB and running the
full migration chain. Assert `sqlite_master` (tables + indexes) and
`pragma_table_info` per table are equivalent. Fails if the two sources of truth
drift.

### C5 — Migration discipline (doc-only)
Add to `CLAUDE.md` (and a header comment in `migrations.ts`): prefer additive
migrations; stage destructive changes across two releases (stop writing in N, drop
in N+1 after a soak); never renumber or delete a shipped migration.

### C6 — Backup pruning
After `markPostUpdateValidationSucceeded`, prune `pre-update-backups/` to the
newest N (propose N=3). Keep it dead simple — sort dirs by mtime, remove the rest.

## Test plan

- **C1:** dry-run the release workflow logic locally (or a workflow lint) to confirm
  two ordered upload steps; assert `latest.yml` is in the final step only.
- **C2:** unit-test the new backup helper (backup created, content matches, failure
  throws); integration-test that a legacy DB triggers a backup before migration and
  a future-schema DB is rejected. Backend Vitest (Node ABI via `test:backend`).
- **C3:** test backup-dir discovery (newest matching `previousVersion-*`); the
  relaunch path is covered by existing restore tests — assert the offer logic, not
  the full Electron relaunch.
- **C4:** the equivalence test is itself the deliverable.
- **C6:** unit-test pruning keeps newest N, removes older, no-op when ≤ N.
- Gate: `npm run verify` (lint + Vitest) + `npm run test:backend`. E2E smoke if
  `index.ts` boot path changes materially.

## Sequencing

- **PR 1 (ship immediately):** C1 alone. Independent, guards the live machine, zero
  risk to app data.
- **PR 2:** C2 + C3 (both edit `index.ts` boot path) + C4 (proves migration safety).
- **PR 3:** C5 (doc) + C6 (pruning). Low risk, low urgency.

---

# Eng Review — Corrections Absorbed (2026-05-22, dual-voice: Claude subagent + Codex)

Both reviewers, independently, found the plan-as-written has data-loss holes in
the cases it's meant to protect. The following corrections are now part of the
plan (mechanical — one right answer, or evidence-backed):

**C2 — backup placement & verification (was: critical gaps)**
- Take the safety backup **before `schema.sql` executes**, not just before
  `runPendingMigrations`. `schema.sql` (`index.ts:104`) is `CREATE … IF NOT EXISTS`
  — on a legacy DB it *writes* (adds tables/indexes), so a backup taken after it is
  no longer the pre-update state. Read schema version read-only from `sqlite_master`
  first; do NOT create `schema_migrations` just to read the version pre-backup.
- The backup must be **verified, not raw**. `db.backup()` writing a file proves
  nothing. Reuse `BackupService`'s temp → `integrity_check` + required-tables +
  manifest → atomic rename (`BackupService.ts:161`), factored into a runtime-free
  helper (it already imports only better-sqlite3/fs/path/crypto). DRY: extract, don't
  reimplement.
- `db.backup()` is **async** (`BackupService.ts:167`) → `initializeDatabase` becomes
  `async`. Its only caller is already inside `whenReady().then(async …)`.
- **version==0-with-data:** back up ANY pre-existing DB that contains app tables/rows,
  even with no `schema_migrations` (a real legacy DB is version 0 but data-bearing,
  and migrations v2/v5 drop columns/tables). Predicate = `fs.existsSync(dbPath)`
  captured **before** `new Database(dbPath)` opens (opening creates the file). Skip
  backup ONLY when the file truly did not pre-exist.
- **Disk-full** fail-closed dialog must state required free space and "free space and
  relaunch" — otherwise a full disk locks the only machine out with no recourse.
- **`app.exit()` does not unwind the stack** (existing bug at `index.ts:92`). Add a
  `fatalStartup()` helper that shows the dialog, closes the DB, and returns/throws a
  sentinel so execution actually stops.

**C3 — rollback discovery & restore path (was: CRITICAL, the safety feature that lies)**
- Discovery by `previousVersion` is **broken**: backups are named with the *update
  target* version (`prepareForUpdateInstall(version)`, `BackupCoordinator.ts:89`),
  while `postUpdateCheck.previousVersion` is the old version. Searching
  `<previousVersion>-*` finds nothing. **Fix: persist an explicit marker** before
  install (backup path, from-version, to-version, schema version, timestamp); restore
  reads the marker, never infers from dir names. Reconcile the inner
  `OpenInventory-Backup/` dir contract that `restoreFromBackup` expects
  (`BackupCoordinator.ts:253`).
- **Migration failure is currently outside the rollback path entirely.** If
  `runPendingMigrations` throws inside `initializeDatabase` (`index.ts:107`), boot
  dies before either validation point AND before `BackupCoordinator` exists — the
  exact failure the backup protects. Wrap `initializeDatabase` and route migration
  exceptions to the same restore offer, using the backup just created.
- **Restore at startup must be runtime-free.** Verified by code inspection:
  `restoreFromBackup` calls `loadSnapshot()` on the live broken DB
  (`BackupCoordinator.ts:260`) before disposing — so on a `loadSnapshot`-failure it
  throws again and can't run. Build a runtime-free startup restore: best-effort
  direct `app_settings` reads for preserve-settings, close the raw handle, swap files,
  relaunch. (This refutes the "move offer after coordinator + reuse restoreFromBackup"
  approach.)

**C4 — schema equivalence test (was: too shallow / tautological)**
- Isolate the two paths: DB-A = empty + `schema.sql` only; DB-B = empty + migration
  chain only. Comparing through the production path (which runs both) is tautological.
- Compare a **canonical snapshot**: `pragma_table_xinfo` (cid, name, type, notnull,
  dflt_value, pk, hidden), `pragma_index_list` + `pragma_index_xinfo`,
  `pragma_foreign_key_list`, and normalized non-table SQL (triggers/views) — not just
  `sqlite_master` + `table_info`. Run `foreign_key_check`.
- **Real drift this will surface day one:** `schema.sql` defines
  `idx_inventory_movements_item_date`; migration v3 (`migrations.ts:77`) adds three
  *different* movement indexes and not `item_date`. See Decision D2.

**C6 — pruning (was: can delete the last valid rollback)**
- Prune by the **embedded dir-name timestamp**, not `mtime` (AV/backup tools rewrite
  mtime on Windows). Only count **validated** backups (readable manifest + verified
  `database.db`) toward N; never delete the last valid rollback. Wrap in try/catch so
  a prune failure never fails boot.

**Sequencing (refined — both reviewers):** split PR2. **Land C4 first** so the index
drift decision (D2) is made before C2/C3 build on the schema. Reconcile C2 and C3
backup-naming in the same change (both must agree on the marker contract).
Revised order: PR1 = C1 · PR2 = C4 (+ any schema fix) · PR3 = C2 · PR4 = C3 · PR5 = C5+C6.

## Decision Audit Trail

| # | Phase | Decision | Class | Principle | Rationale |
|---|-------|----------|-------|-----------|-----------|
| 1 | Eng | Backup before `schema.sql`, verified, reuse BackupService | Mechanical | P4 DRY / completeness | schema.sql writes; raw backup unverified |
| 2 | Eng | `initializeDatabase` → async; `fatalStartup()` helper | Mechanical | P5 explicit | `db.backup()` async; `app.exit()` doesn't unwind |
| 3 | Eng | Back up any pre-existing data-bearing DB (incl. version 0) | Mechanical | P1 completeness | legacy DBs are v0 + destructive migrations |
| 4 | Eng | C3 discovery via persisted marker, not dir-name | Mechanical | P5 explicit | name uses update version, not previousVersion |
| 5 | Eng | Route migration-throw + both validation fails to restore offer | Mechanical | P1 completeness | migration throw was outside rollback path |
| 6 | Eng | Runtime-free startup restore | Evidence (Codex) | correctness | restoreFromBackup loadSnapshot fails on broken DB |
| 7 | Eng | C4 isolated DB-A/DB-B + canonical pragma snapshot | Mechanical | P1 completeness | through-path comparison is tautological |
| 8 | Eng | C6 prune by timestamp + validity, keep last valid | Mechanical | P1 completeness | mtime unreliable; don't delete rollback |
| 9 | Eng | Split PR2; land C4 first | Mechanical | P3 pragmatic | both reviewers; reduce startup blast radius |

## GSTACK REVIEW REPORT

| Run | Source | Status | Findings |
|-----|--------|--------|----------|
| plan-eng-review | claude-subagent | issues_open | 1 critical (C3), 3 high, several medium |
| plan-eng-review | codex (gpt-5.5) | issues_open | 3 critical, 3 high, 5 medium |
| Consensus | both | — | 5/6 dimensions CONFIRMED; 1 disagreement (C1 depth) |

**Verdict: REVISE before implement.** Direction and priorities sound; implementation
had data-loss holes now corrected above.

## Resolved decisions (final gate, 2026-05-22)

- **D1 → C1 includes readability verification.** release.yml: upload artifacts →
  HEAD-check each artifact referenced by `latest.yml` is publicly 200 at the R2 URL →
  upload `latest.yml` last → GET `latest.yml` and assert it resolves to the built
  version. Proves the release is actually consumable, not just uploaded. Guards the
  sole update path of the only production machine.
- **D2 → add migration v6 to reconcile schema drift.** Create the movement indexes
  in the migration chain that only exist in `schema.sql` (`idx_inventory_movements_item_date`)
  and ensure v3's three indexes are also in the `schema.sql` baseline, so fresh-install
  and fully-migrated schemas are identical. Additive + idempotent. C4's equivalence
  test then passes truly and enforces the C5 discipline going forward.

## Final implementation order

1. **PR1** — C1 (R2 ordering + readability verification). Ships now, guards the live machine.
2. **PR2** — C4 (canonical schema-equivalence test) + v6 migration (D2). Land first to pin the schema.
3. **PR3** — C2 (verified pre-migration backup before schema.sql + downgrade guard + `fatalStartup`, async boot).
4. **PR4** — C3 (persisted-marker rollback + runtime-free startup restore + migration-throw routing).
5. **PR5** — C5 (migration discipline doc) + C6 (validated, timestamp-ordered pruning).
