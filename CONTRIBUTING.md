# Contributing to OpenInventory

Thanks for your interest in improving OpenInventory. It's a local-first Electron
desktop app (TypeScript + Effect TS backend, React 19 + Vite frontend) for inventory
monitoring and material issue tracking. This guide covers how to get a dev environment
running and what we expect from a pull request.

## Prerequisites

- **Node.js 22** and **npm**.
- A C/C++ toolchain for native modules — `better-sqlite3` is rebuilt from source per
  platform (Python + a compiler/SDK). On most setups the platform default toolchain is
  enough; CI uses the standard hosted runners.

## Getting started

```bash
npm install
npm run dev      # launches the Electron app in dev mode (rebuilds native modules first, cached after)
```

For browser-only UI work, `npm run dev:preview` serves the renderer against a local
unauthenticated API on `.dev-data`. It is a dev tool only — the packaged production LAN
server never serves the admin UI.

## Native modules — use the npm scripts, never run vitest/playwright directly

The app ships native modules (`better-sqlite3`, `@parcel/watcher`, `msgpackr-extract`)
compiled to a specific ABI. Vitest backend tests need the **Node** ABI; Electron (dev,
E2E, packaged) needs the **Electron** ABI. Wrapper scripts swap and restore the ABI
around each command, so always go through the npm scripts:

```bash
npm run verify         # lint + renderer/backend Vitest suite (the fast gate)
npm run test           # renderer/backend Vitest suite
npm run test:backend   # backend tests only (handles the Node ABI swap + restore)
npm run test:coverage  # combined coverage report under coverage/
npm run test:e2e       # Electron E2E (Playwright) — builds the app first
npm run verify:push    # local pre-push gate: lint, Vitest, full E2E
```

Running `vitest`/`playwright` directly will use the wrong ABI and fail with misleading
errors. See `CLAUDE.md` for the full native-module / build-environment notes.

## Making a change

1. Branch off `master`.
2. Keep diffs focused. Match the surrounding code's style, naming, and comment density.
3. **Tests are expected.** New behaviour needs unit/integration coverage; user-facing
   flows that span the app belong in the Playwright E2E suite (`e2e/`).
4. Run `npm run verify` before pushing (the Git pre-push hook runs `verify:push`).
5. Update `CHANGELOG.md` under `[Unreleased]` for anything user-visible.
6. If you touch UI, read `DESIGN.md` first — the design system is the source of truth.
7. Translations live in `src/renderer/src/app/i18nResources.ts`; keep `en` and `zh-CN`
   in key parity and use ICU single-brace interpolation.

## Pull requests

- Describe what changed and why; link any related issue.
- Confirm the verify gate passes.
- One logical change per PR where practical.

## Platform notes

Windows x64 is the production/release target and the only platform exercised by the
default CI test matrix. macOS (arm64) and Linux (AppImage) builds are produced by the
release workflow; macOS currently ships **unsigned and manual-download** (no auto-update
until code signing is configured).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
