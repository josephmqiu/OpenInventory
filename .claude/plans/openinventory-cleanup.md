# OpenInventory Codebase Cleanup Plan

## Problem Statement
OpenInventory is a vibe-coded Tauri 2 + React 19 + Rust inventory management app.
A deep codebase audit revealed fake features (backup UI that doesn't backup, audit logs
never written, refill orders completely unimplemented), security gaps (no CSP, unauthenticated
public endpoint, overly broad Tauri capabilities), and architecture debt (621-line god
component, duplicated business logic across frontend/backend, no tests, String errors everywhere).

Before building any new features, we need to make the codebase honest, testable, and safe.

## Premises
1. Core inventory operations (create items, receive/issue stock, alerts, QR codes, LAN access) work correctly end-to-end
2. The Rust backend has good bones: clean architecture layers, parameterized SQL, transactions on mutations
3. The frontend is well-typed (no `any` types) but structurally overloaded in App.tsx
4. This is a desktop-first app with 1 user. LAN mode is secondary. Performance optimization (connection pooling) is premature.
5. The previous developer won't be maintaining this. The new contributor (us) needs to understand and trust the code before extending it.

## Phase 1: Remove Fake Features

### 1.1 Strip BackupPanel from UI
- **File:** `src/app/App.tsx`
- **Action:** Remove the "backup" section from sidebar navigation and section rendering
- **Why:** The panel shows "healthy" status when no backup has ever run. This is dangerous misinformation for an inventory app. Users could lose data thinking they have backups.
- **Keep:** `src/ui/components/BackupPanel.tsx` file (for reference when we implement real backup), `app_settings` backup keys in DB (harmless)

### 1.2 Drop refill order tables from schema
- **File:** `src-tauri/src/infrastructure/schema.sql`
- **Action:** Remove CREATE TABLE for `refill_orders` and `refill_order_lines`, plus their indexes
- **Why:** Zero backend logic, zero commands, zero UI. Pure dead schema that confuses anyone reading the DB. Will need redesign when actually implemented.

### 1.3 Remove dead code
- **File:** `src/domain/inventory.ts`
- **Action:** Delete `formatCurrency()` function (defined but never called)

### 1.4 Verify builds
- `npm run build` (TypeScript + Vite)
- `cd src-tauri && cargo check` (Rust)

## Phase 2: Rust Test Suite

### 2.1 Test infrastructure
- **File:** `src-tauri/src/application/inventory_service.rs`
- **Action:** Add `#[cfg(test)] mod tests` with `setup_test_db()` helper
- **Approach:** In-memory SQLite (`:memory:`), apply full schema.sql, test pure business logic
- **Why:** Inventory math bugs = wrong stock counts = real money lost in a warehouse

### 2.2 Stock mutation tests
- Receive stock: quantity math, movement record creation, status transitions
- Issue stock: quantity math, insufficient stock rejection, movement records
- Edge cases: issue exactly available quantity, issue from zero, receive to previously empty

### 2.3 Alert logic tests
- Alert triggering: quantity drops to/below reorder level → open alert created
- Alert resolution: quantity rises above reorder level → alert auto-resolved
- Duplicate suppression: don't create duplicate open alerts for same item

### 2.4 Item CRUD tests
- Create: SKU uniqueness, required field validation, initial quantity
- Update: name/category change without quantity change, SKU uniqueness preserved
- Remove: cascading delete of movements and alerts

### 2.5 Personnel tests
- Name uniqueness (case-insensitive)
- Add and remove operations

## Phase 3: Architecture Cleanup

### 3.1 Extract `useInventoryState` hook
- **From:** `src/app/App.tsx` (621 lines)
- **To:** `src/app/useInventoryState.ts`
- **Moves:** appSnapshot state, polling interval, all mutation handlers, error/notice state, busy state, executeMutation wrapper
- **App.tsx becomes:** thin shell calling hook + section switcher + renderer
- **NOT adding:** React Router, Redux, or any state management library (overkill for single-screen app)

### 3.2 Extract runtime detection
- **To:** `src/app/runtime.ts`
- **Moves:** `detectRuntime()`, `readIssueRouteItemId()`, `readIssueRouteAccessKey()`

### 3.3 Delete in-memory gateway fallbacks
- **File:** `src/services/inventoryGateway.ts`
- **Delete:** `browserSnapshot` global, all `apply*` functions, `syncAlerts` helper
- **Keep:** Tauri invoke calls + HTTP API fetch calls only
- **Why:** Duplicated business logic that will drift from Rust backend. The in-memory mode creates a misleading "works in browser" experience that resets on refresh.

### 3.4 Create Rust `AppError` enum
- **File:** New `src-tauri/src/domain/errors.rs`
- **Variants:** NotFound, DuplicateSku, InsufficientStock, ValidationError, DatabaseError
- **Replace:** All `Result<T, String>` in command handlers
- **Why:** Frontend can't distinguish error types without string-matching. Structured errors enable proper error handling.

## Phase 4: Security Hardening

### 4.1 Set Content Security Policy
- **File:** `src-tauri/tauri.conf.json`
- **Action:** Set `"csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"`
- **Why:** Currently `null` (disabled). Leaves app open to XSS.
- `data:` needed for QR code data URLs. `unsafe-inline` needed for inline styles.

### 4.2 Authenticate public issue endpoint
- **File:** `src-tauri/src/infrastructure/lan.rs`
- **Action:** Add `require_access_key` check to `POST /public/items/:item_id/issue`
- **Why:** Currently zero auth. Anyone with a valid item_id can issue stock. QR codes already embed `?key=...` so the key is available client-side.

### 4.3 Scope Tauri capabilities
- **File:** `src-tauri/capabilities/default.json`
- **Action:** Replace `core:default` with specific permissions: `core:window:default`, `core:event:default`
- **Why:** `core:default` grants file system, shell, window management. Far too broad.

### 4.4 Localize LanAccessPanel (bonus)
- **File:** `src/ui/components/LanAccessPanel.tsx`
- **Action:** Move ~12 hardcoded English strings to `src/app/i18n.ts` dictionary
- **Why:** Only component that breaks i18n support

## NOT in scope
- Connection pooling for SQLite (premature optimization, no bottleneck yet)
- ActionPanel.tsx split (works fine, defer until adding new form types)
- Implementing real backup (separate feature, needs design)
- Implementing refill orders (separate feature, needs design)
- Implementing audit logging (separate feature, needs design)
- Frontend component tests (UI is still being shaped)
- E2E tests (save for when app stabilizes)
- CI/CD pipeline setup (separate concern)

## Execution order
Phase 1 → Phase 2 → Phase 3 → Phase 4
Each phase is independently committable. Phase 2 (tests) must complete before Phase 3 (refactoring) to provide a safety net.

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | P1+P3 | Cleanup scope is right, cherry-pick CLAUDE.md addition | SCOPE EXPANSION (overkill for cleanup) |
| 2 | CEO | Approach A (sequential cleanup) over big-bang | P1+P5 | Tests before refactor = safety net, explicit over clever | Approach B (big-bang rewrite) |
| 3 | CEO | Keep refill order tables (reversal from original plan) | P3+P6 | Codex correctly flagged: dropping tables is product retreat. Keep schema, mark as unimplemented | Drop tables |
| 4 | CEO | Add minimum backup implementation to Phase 1 | P1+P2 | Codex flagged: removing backup UI without replacement leaves product without trust contract. Add SQLite file copy as minimum viable backup. | Leave backup completely out of scope |
| 5 | CEO | Add CLAUDE.md to repo | P2 | In blast radius, <5 min effort, critical for multi-session work | Not adding |

---

## CEO REVIEW (Phase 1)

### CODEX SAYS (CEO — strategy challenge)

Codex delivered 7 findings, 3 unanswered questions. Summary of key challenges:

1. **"Solving the wrong problem"** — Plan frames this as code cleanup, but the product's value is trust (backup, audit, operational reliability). Removing fake features without replacing them with minimum real trust primitives turns this into a weaker stock counter.

2. **"Premise 1 is unverified bet masquerading as foundation"** — Assuming core operations work while excluding E2E and component tests is strategic self-deception. The critical path is QR scan → auth → mutation → ledger → alert → UI, not just Rust math.

3. **"Desktop-first premise is likely false already"** — QR codes + LAN endpoint + access keys = multi-actor workflow. The 6-month regret is not connection pooling, it's identity, authorization, actor attribution, and auditability.

4. **"Dropping refill-order tables is product retreat disguised as cleanup"** — Architecture doc defines refill orders as core. Either refill is part of the wedge (keep tables) or the arch doc is fiction (rewrite it).

5. **"Backup and audit as not-in-scope will look foolish in 6 months"** — These are the trust contract for an inventory product, not peripheral features.

6. **"Structural decisions from current accident, not intended product"** — "No router, no state management" is justified by today's code, but the spec includes alerts center, refill workflows, reports, roles. Second cleanup incoming.

7. **"No market thesis"** — No target segment, no wedge, no reason local-first beats spreadsheets or SMB SaaS. Every scope call is arbitrary without this.

### CLAUDE SUBAGENT (CEO — strategic independence)
[subagent-still-running — proceeding with Codex + primary analysis]

### CEO CONSENSUS TABLE

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   4/5 ok  2/5 ok DISAGREE
  2. Right problem to solve?           Yes     No     DISAGREE
  3. Scope calibration correct?        Yes     No     DISAGREE
  4. Alternatives sufficiently explored? Yes   No     DISAGREE
  5. Competitive/market risks covered? N/A     No     CONFIRMED (gap)
  6. 6-month trajectory sound?         Yes     No     DISAGREE
═══════════════════════════════════════════════════════════════
CONFIRMED = both agree. DISAGREE = models differ (→ taste decision).
```

### CEO Response to Codex Challenges

Codex raises valid strategic concerns. Here's how I'd resolve each:

**On "wrong problem":** Codex is right that pure cleanup without minimum trust primitives weakens the product. **PLAN ADJUSTMENT:** Add minimum viable backup to Phase 1 (SQLite file copy to configured path). This is ~30 min of Rust code and makes the backup panel real instead of fake.

**On Premise 1:** Codex is right this is unverified. But Phase 2 (Rust unit tests) directly addresses this. The tests verify the mutation math, alert logic, and validation. We won't have E2E, but the business logic layer will be proven. **ACKNOWLEDGED, mitigated by Phase 2.**

**On desktop-first premise:** Codex is right the LAN features suggest multi-actor intent. But the plan doesn't need to solve identity/authorization now. It needs to not make it harder later. The architecture cleanup (hook extraction, gateway simplification) makes future multi-user support easier, not harder. **ACKNOWLEDGED, no plan change needed.**

**On refill-order tables:** Codex is right. **PLAN ADJUSTMENT:** Keep the tables. Add a comment in schema.sql marking them as "planned, not yet implemented." Don't drop schema that aligns with the product vision.

**On backup/audit scope:** **PLAN ADJUSTMENT:** Add minimum backup (SQLite copy) to Phase 1. Audit logging stays deferred (requires design decisions about what to log, actor attribution, retention). But acknowledge it as Phase 5 priority.

**On structural decisions:** The "no router" call is for THIS cleanup phase. When refill orders and reports ship, reassess. **ACKNOWLEDGED, no plan change.**

**On market thesis:** Out of scope for a cleanup plan. This is a product strategy question. Valid concern but not actionable here.

### Error & Rescue Registry

| Error Scenario | Current Handling | Plan Fix |
|---|---|---|
| DB file corruption | None | Phase 1: add minimum backup |
| Wrong stock count | No tests to catch | Phase 2: unit tests for mutation math |
| Security breach via public endpoint | No auth | Phase 4: add access key check |
| XSS via injected content | No CSP | Phase 4: set CSP |
| Error type confusion | String matching | Phase 3: AppError enum |

### Failure Modes Registry

| Failure | Severity | Mitigation |
|---|---|---|
| Test suite doesn't catch real bugs | High | Test the actual DB path, not mocks |
| App.tsx refactor breaks state | High | Tests must pass before Phase 3 |
| CSP too restrictive breaks QR display | Medium | Include data: in img-src |
| Backup path doesn't exist / not writable | Medium | Validate path before writing |

### NOT in scope (updated)
- Full backup scheduling (separate feature)
- Audit logging implementation (needs design)
- Refill order implementation (needs design, but KEEP schema)
- Frontend component tests
- E2E tests
- CI/CD pipeline
- Market positioning / product strategy
- Multi-user identity and authorization

### What already exists
| Sub-problem | Existing Code |
|---|---|
| Backup path storage | app_settings table, BackupPanel.tsx form |
| Auth middleware | require_access_key in lan.rs |
| Alert logic | sync_alerts in inventory_service.rs |
| QR generation | qr.rs module |
| i18n | Complete EN/ZH dictionaries |

### Dream State Delta
This plan takes us from "vibe-coded prototype with fake features" to "honest, tested, secure foundation." The 12-month ideal (full refill orders, audit trail, real backup scheduling, multi-user) requires separate feature work. This plan doesn't get us there, but it makes getting there possible without a second rewrite.

### Phase 1 Completion Summary

| Section | Status | Findings |
|---|---|---|
| Premise Challenge | DONE | 4/5 valid, P1 unverified (mitigated by Phase 2), P4 challenged by Codex |
| Existing Code Leverage | DONE | Auth middleware reusable, test infra ready |
| Dream State | DONE | Cleanup → foundation. Feature gap to 12-month ideal acknowledged |
| Alternatives | DONE | Sequential (A) chosen over big-bang (B) and feature-gated (C) |
| Mode | SELECTIVE EXPANSION | Cherry-pick: CLAUDE.md, minimum backup, keep refill tables |
| Dual Voices | DONE | Codex: 7 findings, 3 questions. Subagent: still running |
| Temporal | DONE | Risk concentrated in Phase 3, mitigated by Phase 2 tests |

**PHASE 1 COMPLETE.** Codex: 7 concerns (3 led to plan adjustments). Claude subagent: still running.
Consensus: 1/6 confirmed, 5 disagreements → surfaced at gate.
Passing to Phase 3 (skipping Phase 2 Design — cleanup plan, not new UI design).
