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

## Native module builds

The app ships three native modules (better-sqlite3, @parcel/watcher, msgpackr-extract)
that compile to `.node` binaries tied to a specific ABI. Vitest backend tests need
the Node.js ABI; Electron (dev, E2E, packaged app) needs the Electron ABI. The project
handles this with wrapper scripts — use them, never bypass them.

**Wrapper scripts:**
- `scripts/run-with-node-native-restore.ts` — rebuilds better-sqlite3 for Node (and
  invalidates the Electron rebuild cache), runs command, restores Electron ABI in a
  `finally` block. Used by `test:backend`, `test:coverage`, `test:e2e`, `dev:api`,
  `dev:preview`.
- `scripts/rebuild-electron-native-deps.ts` — rebuilds ALL native modules for Electron
  ABI + codesigns better-sqlite3 on macOS. Caches the result based on Electron version,
  platform, and lockfile hash — skips rebuild when nothing changed. Used by `dev`,
  `pack`, `dist`.

**Always use the npm scripts — never run vitest or playwright directly:**

```bash
npm run test           # Frontend unit tests (Vitest, jsdom) — no native deps needed
npm run test:backend   # Backend tests — wrapper handles Node ABI swap + restore
npm run test:coverage  # Combined coverage — wrapper handles ABI swap
npm run test:e2e       # E2E — seeds with Node ABI, rebuilds Electron, runs Playwright
npm run dev            # Desktop dev — rebuilds Electron ABI first
```

**When touching build scripts, package.json, CI workflows, or native module code:**
think about all environments — local dev (Mac), CI (Mac + Windows), packaged app,
and E2E tests. A change that works in one environment may break another. The E2E
pipeline has a strict order: rebuild Node → build Vite → generate seed DBs → rebuild
Electron → run Playwright. Do not reorder these steps.

Config files: `vitest.config.ts` (frontend), `vitest.config.node.ts` (backend),
`playwright.config.ts` (E2E), `electron.vite.config.ts` (externalizes all deps for
main process), `electron-builder.yml` (unpacks `.node` files and renderer assets from
ASAR — renderer must stay unpacked for LAN server static file serving).

**Build targets:** Mac arm64 only (no x64). Windows x64 only. CI release workflow
builds → smoke tests → publishes (artifacts are validated before upload).

## Testing

Run all three test suites before every commit:

```bash
npm run test           # Frontend unit tests (Vitest, jsdom)
npm run test:backend   # Backend service tests (Vitest, node)
npm run test:coverage  # Combined Vitest coverage report under coverage/
npm run test:e2e       # Electron E2E workflow (Playwright, builds app first)
```

- E2E tests launch a real Electron instance with an isolated temp database.

**Shell environment caveat (Claude Code desktop app):** Node.js and npm are installed
via Homebrew (`/opt/homebrew/bin/`). The Claude Code desktop app may not source
`~/.zshrc`, so `npm` can be missing from PATH. If you see `command not found: npm`,
do NOT work around it by prepending `export PATH=...` to each command — this causes
subtle failures because the wrapper scripts spawn child processes that may not inherit
the patched PATH. The native module rebuild silently fails, producing a bad binary
that makes backend tests fail with misleading errors (e.g., 404s from the LAN router).

Instead, run this once at the start of the session:
```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```
Then run all commands normally without PATH prefixes.

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
