# Plan: E2E Test Workflow Optimization

Reviewed via /plan-eng-review + Codex outside voice on 2026-05-23. One PR, multiple
commits (one per phase).

**Expected to touch only test/infra/seed/doc files.** This is *contingent* on the assumed
production guards already existing exactly as verified (EISDIR `router:247`, downgrade
`index:217`, rollback `index:229`, price feature, `currency` in snapshotEquals). If a guard
is actually missing, the new test stays red and a `src/` fix is the correct response (TDD) —
not a reason to weaken the test. Note: test-infra changes are NOT risk-free — they can mask
failures or add nondeterminism, so the validation gate below is load-bearing.

Baseline (last full run, local macOS): 92 tests / 116s / 2 workers / 0 flaky.
Speedup must be measured on the SAME platform (and validated on Windows CI) — macOS-vs-CI
timing is noise.

## Locked decisions (from review + outside voice)
- Workers: auto-derive `min(cpus-1, 4)`, floor 2 locally; **CI defaults to 3**, bump to 4
  only if a Windows-CI A/B (changed lanes 3x at PW_WORKERS=3 and 4) is faster AND 0-flaky
  across all 3 runs. `PW_WORKERS` still overrides. (windows-latest = production CI target.)
- Efficiency: convert **read-only specs only** to worker-shared (smoke, dashboard,
  quick-issue-no-personnel). audit + inventory-discovery STAY isolatedTest — converting
  them needs implicit test ordering, and learning `lan_e2e_formport_state_leak` (9/10) is
  logged evidence shared-page serial specs already caused a real state-leak bug here.
  **Each converted spec gets a `beforeEach` reset** (navigate + clear filters/sort/selection)
  so shared-app UI state can't leak across tests or into a retry.
- Migration-safety E2E: **seed-state simulation only** (no live fault injection).
- Phase 3 launch: **bespoke direct launch + `--smoke-test`** (reuse graceful-shutdown
  pattern). **Assert on the child-process exit code** via `electronApp.process()` `close`
  event + a hard timeout — NOT `stubRestoreRelaunchCapture` (the app exits during startup
  before `app.evaluate` can attach) and NOT a flaky "no window" check.
- LAN static E2E: happy path **+ EISDIR/traversal regression** including Windows-specific
  traversal variants (`%2e%2e`, backslash); assert MIME by **prefix**, not exact charset.
- `dialogs.ts` private-API: **loud assertion guard** on `_invokeHandlers` (not a rewrite).
- Price/currency E2E: **dedicated pricing.spec + pricing seed**. Seed provides 3 priced
  items (one null-price); sort/details/currency tests READ seeded items independently; the
  create→modify→clear arc + invalid-price test use a DEDICATED throwaway item so a create
  failure can't corrupt the read tests (no cascading serial dependency).
- Invalid-price validation E2E: **included**.
- Before touching `playwright.config.ts`/lane runners: **audit project filters, lane names,
  CI commands, and `report-e2e-results.ts` parsing**; audit existing positional/`nth-child`
  selectors against the price column (column already shipped on master, so low risk).

## Commit sequence (one PR)

### Commit 1 — infra: worker auto-derivation
- `scripts/run-e2e-lane.ts`: replace fixed per-lane `workers` with `min(os.cpus().length-1,4)`
  (floor 2) locally; `process.env.CI` → **3** (not 4). `PW_WORKERS` overrides. full +
  parallel-safe use auto; smoke stays 2. The bump to CI=4 is a follow-up gated on the
  Windows A/B in Commit 6.

### Commit 2 — efficiency: read-only worker-shared conversions + dedup + DRY
- Convert `smoke`, `dashboard`, `quick-issue-no-personnel` from isolatedTest → worker-shared
  `test` (1 boot/worker; read-only so no ordering/state-leak risk). ~7 boots saved.
- Remove duplicated "public issue POST → 404" from `quick-issue-mobile.spec` (kept in
  `lan-access.spec:141`).
- New `e2e/fixtures/lan-constants.ts` (ports 19877-19883 + keys); import in
  `generate-seeds.ts` and LAN specs (kills the two-place hand-sync).

### Commit 3 — review finding fixes
- `dialogs.ts`: assert `_invokeHandlers` is a Map at stub time; throw clear error otherwise.
- `smoke.spec:32`: drop `if (hasTable>0)` guard; assert real DOM (table present, 0 rows).
- `audit.spec:58`: assert `itemName` truthy before `toContainText` (no vacuous pass).
- `lan-access.spec:158`: split mislabeled test → real invalid value (-1) for validation +
  separate "save disabled when unchanged"; **reset port input to a valid value before test
  end** (per `lan_e2e_formport_state_leak`).
- Extract retry-with-backoff cleanup from `electron-app.ts` into shared util; reuse in
  `backup.spec`, `qr-export.spec`, `backup-restore-handoff.spec` (Windows flake risk).
- `theme-and-language.spec:15`: assert `data-theme="dark"` explicitly.
- `graceful-shutdown.spec`: remove duplicated JSDoc block.

### Commit 4 — coverage: price/currency (P1)
- New `pricing` seed (priced items w/ `unit_price_minor` + `app.currency`="CNY").
- New project in `playwright.config.ts`; add to parallel-safe lane.
- `e2e/pricing.spec.ts` (worker-shared serial):
  1. create item with price → table shows ¥X.XX; DB stores integer minor units.
  2. modify price → reformats; clear price → "—" (null in DB).
  3. price column sort: ASC → nulls first, DESC → nulls last (per `?? -1` sort key).
  4. item-details panel shows formatted price.
  5. currency CNY→USD → symbol ¥→$, **number unchanged (no rescale)**, reformats live,
     persists across reload.
  6. invalid price ("1.234" over-precision, negative) → validation error, no item created.

### Commit 5 — coverage: LAN static + update-ready chip
(migration-safety E2E was attempted and DROPPED — see NOT in scope.)
- `lan-access.spec`: GET `/assets/<real>.js` → 200 + MIME (prefix match); GET `/assets/`
  (dir) → 404 + app stays up (EISDIR regression); traversal `%2e%2e`, `%2f`, `%5c`
  variants → 403/404. Readiness/liveness via the no-auth `/issue.html` route (the spec
  is serial and earlier tests regenerate the access key, so keyed checks would fail here).
- `update.spec`: stub `get-update-status` → "downloaded" and reload; assert `update-chip`
  visible + its action.

### Commit 6 — docs
- Update `.claude/rules/useeffect-polling-guards.md` to list `currency` in snapshotEquals.

### Commit 6 — docs + validation
- Update `.claude/rules/useeffect-polling-guards.md` to list `currency` in snapshotEquals
  (stale; code already compares it at `useInventoryState.ts:113`).
- Validation gate (Windows CI is source of truth, not local macOS): run the changed lanes
  **3x** at `PW_WORKERS=3` and `PW_WORKERS=4`; all runs must be **0-flaky**. Adopt CI=4 only
  if it is faster AND 0-flaky across all 3; otherwise keep CI=3. Capture before/after
  duration from `test-results/e2e-report.json` on the same platform.

## Outcome note (2026-05-23)
Shipped: worker auto-derivation, read-only worker-shared conversions, review finding
fixes, price/currency E2E, the `.col-price` width fix (a real pre-existing bug the
price-sort test surfaced), and the LAN static + update-chip edges. **Migration-safety
E2E was attempted and dropped** — asserting a startup-time process exit under
Playwright's managed Electron proved unreliable (exit/dialog timing, exactly as the
outside voice predicted). The downgrade guard and rollback-marker guard remain covered
by `test/services/migrationSafety.test.ts` + `test/integration/migrations.test.ts`.

## NOT in scope (deferred, with rationale)
- Migration-safety startup-guard E2E — Playwright/Electron process-exit timing is
  unreliable for startup-time exits; the guards are unit-covered. (Attempted, reverted.)
- Convert audit/inventory-discovery to worker-shared — implicit ordering fragility +
  documented state-leak risk; speedup not worth it.
- Live migration fault-injection E2E — fragile; the failure→backup→rollback path stays
  unit-tested (`test/services/migrationSafety.test.ts`).
- reset-DB-per-test shared-app infra — new infra, rejected for risk.
- 0-decimal currency / sell price / FX / price history — pre-deferred pricing follow-ups
  (TODOS.md), not part of v1.
- Production update download/install/restart E2E — needs a real signed release; unit-covered.
- Currency-switch rollback-on-persistence-failure path — LAN/HTTP edge; unit-level.

## What already exists (reused, not rebuilt)
- `quick-issue-mobile.spec` worker-shared model (proves the conversion pattern).
- `cleanupUserDataDir` retry-with-backoff (`electron-app.ts:38`) — extracted + reused.
- `stubRestoreRelaunchCapture` (`dialogs.ts:136`) — reused for rollback-halt assertion.
- `graceful-shutdown.spec` bespoke-launch pattern — reused for migration-safety.
- `--smoke-test` flag (`index.ts:364`) — non-blocking fatal/rollback paths.
- formatter/parser unit tests — E2E tests integration only, not parsing.

## Failure modes
| New path | Realistic prod failure | Test? | Error handling? | Visible? |
|----------|------------------------|-------|-----------------|----------|
| Currency switch | snapshotEquals omits currency → no live reformat | YES (live-reformat assert) | optimistic + rollback (useInventoryState:524) | yes |
| Price persist | minor-unit round-trip drift | YES (DB assert) | parser rejects bad input | yes |
| LAN /assets/ dir | EISDIR → app.exit(1) DoS (pre-auth) | YES (regression) | statSync().isFile() guard (router:247) | n/a (404) |
| Downgrade open | newer-schema DB silently opened/corrupted | YES (guard) | fatalStartup exit(1) | dialog |
| Rollback loop | retry failed upgrade forever | YES (marker halt) | marker check (index:229) | dialog |

No critical gaps (none are no-test AND no-error-handling AND silent).

## Parallelization (worktree lanes)
- Lane A: Commit 1 (run-e2e-lane.ts) — independent.
- Lane B: Commit 2+3 (spec edits + fixtures) — shared e2e/ fixtures, sequential within lane.
- Lane C: Commit 4 (pricing) — new files; touches playwright.config.ts + run-e2e-lane.ts.
- Lane D: Commit 5 (migration-safety + edges) — new files; touches playwright.config.ts + generate-seeds.ts.

Conflict flags: Lanes C+D both touch `playwright.config.ts`, `generate-seeds.ts`,
`run-e2e-lane.ts` (lane registration + seeds). Recommend C → D sequential, or one author
owns those 3 shared files. Given it's one PR, simplest is sequential commits 1→6.

## Implementation Tasks
- [ ] **T1 (P2)** infra — auto-derive workers; `scripts/run-e2e-lane.ts`
- [ ] **T2 (P2)** e2e — read-only worker-shared conversions; smoke/dashboard/quick-issue-no-personnel
- [ ] **T3 (P2)** e2e — remove duplicated POST-404; quick-issue-mobile.spec
- [ ] **T4 (P2)** e2e — extract lan-constants.ts; generate-seeds + LAN specs
- [ ] **T5 (P2)** e2e — review finding fixes (dialogs/smoke/audit/lan-access/theme/cleanup/jsdoc)
- [ ] **T6 (P1)** e2e — pricing.spec + pricing seed (incl. invalid-price)
- [ ] **T7 (P1)** e2e — migration-safety.spec (downgrade + rollback marker)
- [ ] **T8 (P2)** e2e — LAN static-asset + EISDIR/traversal regression
- [ ] **T9 (P2)** e2e — update-chip downloaded state
- [ ] **T10 (P3)** docs — currency in useeffect-polling-guards.md
- [ ] **T11 (P2)** ci — validate changed lanes 3x at PW_WORKERS=3 & 4 on Windows; adopt CI=4 only if faster AND 0-flaky

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (infra/test PR) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES_FOUND | ~18 raised; 2 cross-model tensions resolved, rest folded in |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 6 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | n/a (no UI change) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a |

- **CODEX:** soften "zero src/ / cannot regress" claim; per-test reset for read-only conversions; assert migration via child exit code (not app.evaluate stub); selector/lane-runner audit; Windows traversal variants + MIME prefix; multi-run Windows validation. Two tensions decided by user: pricing restructured for independence; CI defaults to 3 with Windows A/B before 4.
- **CROSS-MODEL:** Eng + Codex agree the plan is sound; the two genuine contradictions (pricing serial ordering, CI=4 force) were surfaced and resolved in the user's favor of the safer option.
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED — ready to implement. One PR, commits 1→6 sequential.
