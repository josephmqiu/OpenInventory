# E2E Guardrails

## Fixture modes

- Use `test` from [fixtures/electron-app.ts](./fixtures/electron-app.ts) for intentional narrative flows that share one Electron app/page inside a project.
- Use `isolatedTest` from [fixtures/electron-app.ts](./fixtures/electron-app.ts) when a spec can start from a seed and recreate its own preconditions. This is the default choice for new independent specs.

## Lanes

- Full hardening: `npm run test:e2e:run`
- Smoke lane: `npm run test:e2e:smoke:run`
- Parallel-safe lane: `npm run test:e2e:parallel-safe:run`
- Local pre-push gate: `npm run verify:push`
- Release gate: `npm run verify:release`

The seed matrix uses distinct LAN ports for browser-facing projects, so both the full lane and the parallel-safe lane can run with more than one Playwright worker.
The smoke lane stays intentionally small for quick local confidence on launch, CRUD, inventory discovery, and stock mutation. Localization, shutdown, backup, LAN, QR export, and restore checks stay in the full/release lane because they are slower or more environment-sensitive.
The parallel-safe lane focuses on the broad state-safe subset that gives faster confidence without waiting on the longer mutation-heavy narrative projects.
The lane runner sets `PW_FAIL_ON_FLAKY=1` by default. A test that passes only after a retry fails the run and should be fixed, not accepted as green.

## Coverage Map

- Inventory: empty state, create/update/delete, search, filters, sorting, item details, QR actions.
- Stock: receive, issue, insufficient-stock guard, batch issue, low-stock alerts, movement history.
- Dashboard: metric drill-through, alerts tab navigation, recent alert item drill-down.
- Activity/audit: log table, filters, pagination, CSV export, summary tabs, item balance drill-down, empty state, movement deletion.
- Personnel/settings: add/remove personnel, backup tab layout, stock-action blocking without personnel.
- Backup/restore: configuration, backup creation, overwrite behavior, validation failures, pending restore handoff, stale/error status states.
- LAN/mobile: access-key auth, disconnect/reconnect, key regeneration, public QR lookup route, invalid ports, clipboard feedback, stopped status, occupied-port resilience.
- QR export: single-label save and selected-label folder export.
- Shell: theme persistence, language switching, graceful shutdown, startup smoke.

## Authoring rules

- Do not wrap core assertions in `if (isVisible())` or similar silent guards.
- Do not use `waitForTimeout` unless the test explicitly exists to validate timer or poll behavior.
- Prefer outcome assertions over visibility-only assertions.
- Prefer shared helpers for dialogs, downloads, LAN setup, and banners instead of duplicating stubs inline.
- If a spec is independent, import `isolatedTest` instead of the worker-shared fixture.
- If a browser-facing spec needs LAN, give it its own seed scenario and port instead of reusing another project's LAN seed.

## Reporting

- Every lane writes [test-results/e2e-report.json](../test-results/e2e-report.json).
- Use `npm run test:e2e:report` to print the slowest tests from the latest report.
