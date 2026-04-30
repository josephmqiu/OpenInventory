# E2E Guardrails

## Fixture modes

- Use `test` from [fixtures/electron-app.ts](./fixtures/electron-app.ts) for intentional narrative flows that share one Electron app/page inside a project.
- Use `isolatedTest` from [fixtures/electron-app.ts](./fixtures/electron-app.ts) when a spec can start from a seed and recreate its own preconditions. This is the default choice for new independent specs.

## Lanes

- Full hardening: `npm run test:e2e:run`
- Smoke lane: `npm run test:e2e:smoke:run`
- Parallel-safe lane: `npm run test:e2e:parallel-safe:run`

The seed matrix uses distinct LAN ports for browser-facing projects, so both the full lane and the parallel-safe lane can run with more than one Playwright worker.
The smoke lane stays intentionally small for quick PR feedback on launch, CRUD, discovery, localization, and shutdown.
The parallel-safe lane focuses on the isolated subset that gives fast confidence without waiting on the longer narrative projects.

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
