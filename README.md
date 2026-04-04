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

The app opens an Electron window. Data is stored in `~/Library/Application Support/inventory-monitor/data/` (macOS).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Electron app in dev mode with HMR |
| `npm run build` | Production build (main + preload + renderer) |
| `npm run test` | Frontend unit tests |
| `npm run test:backend` | Backend service + integration tests |
| `npm run test:coverage` | Full Vitest coverage report (frontend + backend) |
| `npm run test:e2e` | Electron E2E workflow (builds app, runs Playwright) |
| `npm run lint` | ESLint |
| `npm run pack` | Package app (unpacked) |
| `npm run dist` | Package app for distribution |

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
npm run test           # Frontend unit tests (Vitest, jsdom)
npm run test:backend   # Backend tests (Vitest, node)
npm run test:coverage  # Combined Vitest coverage report under coverage/
npm run test:e2e       # E2E workflow against a real Electron instance
```

The E2E suite launches the app with an isolated temporary database and covers the most important product journeys: inventory lifecycle, LAN access, browser quick issue, backup, theme/language, and stock workflows.

## Design

The app follows an industrial/utilitarian design system documented in `DESIGN.md`. Key choices:

- IBM Plex Sans + JetBrains Mono typography
- Amber accent (not the usual SaaS blue)
- Max 4px border radius
- Dark-first with warm light theme option

## License

Private project.
