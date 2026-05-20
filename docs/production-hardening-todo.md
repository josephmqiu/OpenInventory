# OpenInventory Production Hardening TODO

This file is the persistent Codex tracker for the production hardening work.
Keep it updated as implementation progresses so the work survives context
summaries, app restarts, and handoffs.

## Scope Decisions

- Windows is the production customer platform. Mac is dev-only.
- Keep PR CI cheap. Do not add always-on PR E2E.
- Do not add branch protection or a `run-e2e` label workflow in this pass.
- Prefer risk-focused tests at the IPC/data/update seams over broad coverage
  percentage chasing.

## Phase 0 - Trust The Gate Again

- [x] Fix red smoke CRUD E2E selector in `e2e/inventory-crud.spec.ts`.
- [x] Re-run `npm run test:e2e:smoke`.

## Phase 1 - Update Safety

- [x] Add a verified local pre-update backup before `quitAndInstall()`.
- [x] Also attempt the configured backup target before update when configured.
- [x] Abort install if the local pre-update safety backup fails.
- [x] Add post-update validation on first launch of a new app version.
- [x] Fail closed on post-update validation failure and direct operator to restore.
- [x] Add upgrade-path integration tests using prior-version/golden DB fixtures.
- [x] Assert upgrade invariants: integrity check, foreign keys, row counts,
  movement totals, inventory balances, settings preservation.

## Phase 2 - CI Topology

- [x] Move fast CI from macOS to Windows.
- [x] Move reusable test-suite matrix from macOS+Windows to Windows.
- [x] Remove Mac release build lane.
- [x] Keep release build gated by full test-suite before packaging/publish.
- [x] Add targeted coverage thresholds or equivalent focused coverage checks for
  database, migrations, backup/restore, stock mutation, and audit code.

## Phase 3 - Operational Maturity

- [x] Document unsigned Windows build as an accepted risk with date, rationale,
  consequences, and revisit trigger.
- [x] Document production release rule.
- [x] Document restore drill expectations.
- [ ] Add release channel / canary rollout support when operationally justified.
- [ ] Add structured local logs, update outcome logs, backup failure visibility,
  support bundle export, and privacy-conscious crash reporting when justified.

## Verification Log

- 2026-05-20: Baseline `npm run test:coverage` passed: 627 Vitest tests,
  coverage 66.11% statements / 58.62% branches / 64.66% functions /
  67.83% lines.
- 2026-05-20: Baseline `npm run verify` passed.
- 2026-05-20: Baseline `npm audit --omit=dev` passed with 0 vulnerabilities.
- 2026-05-20: Baseline `npm run test:e2e:smoke` failed in CRUD selector:
  `label:has-text('Unit')` also matched `Unit Price`.
- 2026-05-20: `npm run lint` passed.
- 2026-05-20: `npm run test:backend` passed: 24 files, 342 tests.
- 2026-05-20: `npm run test` passed: 58 files, 623 tests.
- 2026-05-20: `npm run test:coverage` passed with focused production-risk
  coverage check: 58 files, 623 tests; coverage 64.54% statements /
  57.8% branches / 63.4% functions / 66.13% lines.
- 2026-05-20: `npm run test:e2e:smoke` passed: 25 tests, no flakes.
