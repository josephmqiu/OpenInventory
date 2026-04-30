# OpenInventory

Desktop inventory management app for small teams. Track stock levels, issue materials, manage reorder alerts, and generate QR labels — all from a local SQLite database with optional LAN access for tablets.

Built with Electron, TypeScript, React 19, and Effect TS.

## Features

- **Inventory tracking** — create items with SKU, category, location, unit, supplier, and reorder thresholds
- **Stock operations** — receive and issue materials with audit trail (who, when, why)
- **Batch issue** — issue multiple items in a single transaction
- **Low-stock alerts** — automatic alerts when quantities drop below reorder levels
- **QR labels** — generate and export labeled QR codes for quick item lookup
- **Personnel management** — track who performs stock movements
- **Backup** — scheduled and on-demand SQLite backups
- **LAN access** — optional HTTP server for tablet-based stock operations on the local network
- **Bilingual** — English and Simplified Chinese (zh-CN)
- **Dark/Light/Auto themes** — industrial design with amber accent

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 41, electron-vite |
| Backend (main process) | TypeScript, Effect TS, better-sqlite3 |
| Frontend (renderer) | React 19, Vite, custom CSS |
| Database | SQLite (local file, zero config) |
| IPC | Electron contextBridge with typed channels |
| LAN server | Node.js HTTP with access key auth |
| Tests | Vitest (unit/integration), Playwright (E2E) |

## Getting Started

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev
```

The app opens an Electron window. The first `npm run dev` rebuilds native modules
for Electron (cached on subsequent runs). Data is stored in
`~/Library/Application Support/inventory-monitor/data/` (macOS).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Electron app in dev mode with HMR |
| `npm run build` | Production build (main + preload + renderer) |
| `npm run test` | Full Vitest unit/integration suite (renderer + backend) |
| `npm run test:backend` | Backend service + integration tests only |
| `npm run test:coverage` | Full Vitest coverage report (frontend + backend) |
| `npm run test:e2e` | Electron E2E workflow (builds app, runs Playwright) |
| `npm run verify` | Lint + full Vitest suite |
| `npm run verify:push` | Local pre-push gate: lint, Vitest, full E2E |
| `npm run verify:release` | Full release gate: lint, Vitest, coverage, full E2E |
| `npm run lint` | ESLint |
| `npm run pack` | Package app (unpacked, cleans dist/ first) |
| `npm run dist` | Package app for distribution (cleans dist/ first) |

Native module rebuilds are cached — repeated `dev`/`dist` runs skip the rebuild
if nothing changed (Electron version, platform, or lockfile).

## Project Structure

```
src/
  main/               # Electron main process
    services/          #   Effect TS service layer (DatabaseService, etc.)
    infrastructure/    #   SQLite schema, migrations, LAN server
    ipc/               #   IPC handler registration
  preload/             # contextBridge preload script
  renderer/src/        # React frontend
    app/               #   App shell, state hook, i18n, routing
    domain/            #   Business logic, TypeScript models
    services/          #   Gateway abstraction (IPC or HTTP)
    ui/components/     #   React components (11 total)
test/                  # Backend test suite
e2e/                   # Playwright E2E tests
```

## Testing

```bash
npm run verify         # Lint + renderer/backend Vitest suite
npm run test:coverage  # Combined Vitest coverage report under coverage/
npm run test:e2e       # E2E workflow against a real Electron instance
npm run verify:push    # Same gate enforced by the Git pre-push hook
```

The E2E suite launches the app with an isolated temporary database and covers the most important product journeys: inventory lifecycle, LAN access, browser quick issue, backup, theme/language, and stock workflows.
Retries are treated as failures by default so flaky tests have to be fixed instead of silently passing.

## CI Policy

GitHub CI on pull requests and pushes to `master` runs only the fast lint + Vitest gate (`npm run verify`) to conserve build minutes. The full test suite, coverage, E2E matrix, packaging smoke tests, and release publishing run from the release workflow on version tags. The full test suite can also be run manually from GitHub Actions with the `Test Suite` workflow.

## Design

The app follows an industrial/utilitarian design system documented in `DESIGN.md`. Key choices:

- IBM Plex Sans + JetBrains Mono typography
- Amber accent (not the usual SaaS blue)
- Max 4px border radius
- Dark-first with warm light theme option

## License

[MIT](LICENSE) © josephmqiu
