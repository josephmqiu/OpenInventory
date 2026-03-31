# OpenInventory

Electron desktop app (TypeScript + Effect TS backend, React 19 + Vite frontend) for inventory monitoring and material issue tracking.

## Tech Stack
- **Desktop shell**: Electron (electron-vite for build tooling)
- **Backend** (main process): Effect TS services, better-sqlite3, Node.js HTTP server for LAN access
- **Frontend** (renderer): React 19 + Vite, custom CSS, no UI framework
- **Database**: SQLite via better-sqlite3
- **IPC**: Electron contextBridge with typed invoke API
- **Tests**: Vitest + Playwright (see Testing section below)

## Key directories
- `src/main/` — Electron main process (Effect TS services, IPC, LAN server)
- `src/preload/` — contextBridge preload script
- `src/renderer/src/` — React frontend (app, domain, services, ui)
- `test/` — Backend test suite (services, lan, ipc, integration)

## Testing

Run all three test suites before every commit:

```bash
npm run test           # Frontend unit tests (Vitest, jsdom)
npm run test:backend   # Backend service tests (Vitest, node — 103 tests)
npm run test:e2e       # Electron E2E workflow (Playwright — 8 tests, builds app first)
```

- `test:e2e` handles native module rebuild/restore automatically.
- E2E tests launch a real Electron instance with an isolated temp database.
- Config files: `vitest.config.ts` (frontend), `vitest.config.node.ts` (backend), `playwright.config.ts` (E2E).

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
