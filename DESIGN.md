# Design System — OpenInventory

## Product Context
- **What this is:** Electron desktop app for inventory monitoring and material issue tracking
- **Who it's for:** Small business owners and teams (1-2 people handling ordering, tracking, issuing)
- **Space/industry:** Inventory management, warehouse operations, supply chain
- **Project type:** Desktop app (Electron) with tablet support via LAN HTTP server
- **Usage environment:** Desktop primary, tablet secondary. Extended daily use.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian
- **Decoration level:** Minimal — typography and data density do the work. No gradients, no decorative shadows, no ornamental elements. Borders are structural.
- **Mood:** Calibrated instrument panel. The UI should feel like picking up a well-balanced hand tool, not opening a pretty app. Matte surfaces, hard edges, signal colors used sparingly.
- **Material language:** Matte charcoal panels (dark), warm paper stock (light). Fine dividers instead of shadows. Thin strokes, hard seams.
- **Anti-patterns (never use):** Purple/violet gradients, 3-column icon grids with colored circles, centered-everything layouts, bubbly border-radius above 4px, decorative blob shapes, glassmorphism, generic SaaS blue as dominant color, floating card gardens, soft box-shadows.

## Typography
- **Display/KPI:** JetBrains Mono 700 — monospace at large sizes for dashboard counters and key metrics. Communicates precision and tool-grade identity.
- **Section headings / UI:** IBM Plex Sans 600 — clean, industrial, excellent at all sizes. Designed for enterprise and industrial interfaces.
- **Body / forms / nav:** IBM Plex Sans 400, 500 — consistent family with headings, warm humanist geometry.
- **Data / tables:** IBM Plex Mono 400, 500 — tabular figures by default, columns of numbers align perfectly. Monospace in tables communicates precision.
- **Code / SKUs / IDs:** JetBrains Mono 400 — natural fit for machine-readable strings.
- **Loading:** Google Fonts CDN
  ```html
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  ```
- **Scale:**
  - KPI display: 28-48px (JetBrains Mono 600-700)
  - Page title: 18px (IBM Plex Sans 600)
  - Section heading: 13-15px (IBM Plex Sans 600)
  - Body: 13-14px (IBM Plex Sans 400)
  - Table data: 12-13px (IBM Plex Mono 400)
  - Labels: 10-11px (IBM Plex Sans 600, uppercase, letter-spacing 0.08em)
  - Micro: 9-10px (labels in instrument strip, column headers)
- **Rules:**
  - ALL-CAPS with letter-spacing for labels, column headers, section labels
  - font-variant-numeric: tabular-nums on all numeric data
  - No font weight above 700 anywhere

## Color

### Approach
Restrained. Near-monochrome base with amber/ochre as the sole accent color. Color is rare and meaningful — when you see color, it signals something (danger, warning, success, interactive). Never decorative. Every inventory app uses blue. We use amber: the color of caution tape, warehouse signage, and industrial equipment highlights.

### Dark Theme — "Instrument Panel"
Default theme. Optimized for extended use and reduced eye fatigue.

```css
:root {
  --bg: #111114;
  --surface: #1A1A1F;
  --raised: #232329;
  --input-bg: #18181D;
  --text: #E8E6E3;
  --text-muted: #9B9A97;
  --text-dim: #7E7E86;
  --accent: #D4912A;
  --accent-hover: #E09E30;
  --accent-muted: rgba(212, 145, 42, 0.10);
  --accent-on: #111114;       /* text color ON accent backgrounds */
  --border: #2A2A32;
  --border-strong: #3A3A44;
  --danger: #C5473D;
  --danger-muted: rgba(197, 71, 61, 0.10);
  --warning: #E0B22E;
  --warning-muted: rgba(224, 178, 46, 0.10);
  --success: #4E8F63;
  --success-muted: rgba(78, 143, 99, 0.10);
  --info: #7B93A8;
  --info-muted: rgba(123, 147, 168, 0.08);
}
```

### Light Theme — "Technical Drawing"
For bright environments or user preference. Warm off-white, not blue-tinted.

```css
:root[data-theme="light"] {
  --bg: #F7F6F4;
  --surface: #FFFFFF;
  --raised: #EEEDEB;
  --input-bg: #FFFFFF;
  --text: #1A1A1E;
  --text-muted: #6B6966;
  --text-dim: #787572;
  --accent: #B87A1A;
  --accent-hover: #D4912A;
  --accent-muted: rgba(184, 122, 26, 0.07);
  --accent-on: #FFFFFF;
  --border: #E2E0DC;
  --border-strong: #D1CFCB;
  --danger: #B73A2F;
  --danger-muted: rgba(183, 58, 47, 0.06);
  --warning: #9E7B14;
  --warning-muted: rgba(158, 123, 20, 0.06);
  --success: #3D7A51;
  --success-muted: rgba(61, 122, 81, 0.06);
  --info: #5A7A94;
  --info-muted: rgba(90, 122, 148, 0.06);
}
```

### Sidebar
The sidebar is the structural frame of the app. Dark in dark theme, warm stone in light theme.

```css
/* Dark theme sidebar */
:root {
  --sidebar-bg: #0D0D10;
  --sidebar-text: #E8E6E3;
  --sidebar-muted: #82828A;
  --sidebar-border: #2A2A32;
  --sidebar-active-bg: rgba(212, 145, 42, 0.10);
  --sidebar-accent: #D4912A;
  --sidebar-hover: rgba(255, 255, 255, 0.03);
}

/* Light theme sidebar — warm stone */
:root[data-theme="light"] {
  --sidebar-bg: #EFEEEC;
  --sidebar-text: #1A1A1E;
  --sidebar-muted: #6B6966;
  --sidebar-border: #E2E0DC;
  --sidebar-active-bg: rgba(184, 122, 26, 0.08);
  --sidebar-accent: #B87A1A;
  --sidebar-hover: rgba(0, 0, 0, 0.04);
}
```

### Color Usage Rules
- Accent is for interactive focus, selected state, primary buttons, and critical counts only
- Status colors appear as text color, pills, and 2px left-border row stripes. Never full-card fills.
- In tables, the quantity cell itself carries semantic color as text color (danger for 0, warning for low). The data IS the indicator.
- Text stays near-monochrome. Color is a signal, not decoration.
- Light theme signal colors are darkened versions of dark theme colors for proper contrast on light backgrounds. Same hue family, adjusted intensity.

## Spacing
- **Base unit:** 4px
- **Density:** Compact — this is a tool, not a magazine
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)
- **Rules:**
  - Tight but consistent. 4, 8, or 12px paddings instead of 16-24px.
  - Data tables: 8-10px cell padding vertical, 14-16px horizontal
  - Panels/cards: 16-20px internal padding
  - Section gaps: 16px between content blocks
  - Page padding: 20-24px

## Layout
- **Approach:** Grid-disciplined — strict alignment, predictable structure
- **App shell:** 220px sidebar + fluid content area
- **Sidebar:** Always dark, narrow, icon + label navigation. Active item has 2px amber left-border accent.
- **Dashboard:** Instrument strip (not floating metric cards) as a horizontal band of tightly aligned readouts with dividers. Inventory table directly below, above the fold.
- **Tables:** The table is the hero. Filters and actions sit in a compressed control bar above the table. Not separate navigation.
- **Detail views:** Right-side inspector or slide-out panel, not full-page navigations.
- **Grid columns:** Single-column content for most views. 2-column (content + sidebar) for detail/edit views.
- **Max content width:** No max-width constraint — the app should use available space
- **Border radius:**
  - 0px: tables, inline elements, row states
  - 2px: inputs, buttons, chips, status pills
  - 3px: cards, panels
  - 4px: modals, top-level containers
  - Nothing above 4px. Ever.

## Responsive Strategy

The same React frontend is served in two contexts:
- **Desktop (Electron):** Window with sidebar layout, `data-platform="desktop"` on `<html>`
- **Web/LAN (mobile/tablet):** Served via LAN HTTP server, `data-platform="web"` on `<html>`

### Breakpoints
| Breakpoint | Applies to | Effect |
|------------|-----------|--------|
| 1200px | Both | Reduces grid columns (metrics 5->3, backup 3->2). Desktop sidebar narrows 220->180px, content padding tightens. |
| 960px | Web only | Major layout transform: sidebar collapses to horizontal top nav, single-column layout. |
| 720px | Web only | Further mobile optimizations: 2-column nav, 2-column metrics, horizontal table scroll. |

### Platform Detection
The `data-platform` attribute is set on `<html>` before first paint:
- **Electron:** Inline `<script>` in index.html checks `window.electronAPI` (exposed by preload contextBridge)
- **LAN web:** The LAN HTTP server injects `data-platform="web"` into the HTML during serving
- **React:** `main.tsx` reinforces the attribute via `detectRuntime()` as a safety net

### Desktop Window Constraints
- Minimum: 900x600px (set via BrowserWindow minWidth/minHeight)
- Default: 1480x960px
- The sidebar always remains visible on desktop regardless of window size

### Rules
- The 960px and 720px breakpoints use `[data-platform="web"]` selector prefix
- The 1200px breakpoint applies universally (no platform prefix) plus desktop-specific compression rules
- Desktop compression at narrow widths is handled by platform-specific rules, not by collapsing to mobile layout

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:**
  - Micro: 100ms — button hovers, focus rings, state toggles
  - Short: 150-200ms — panel transitions, dropdown open
  - Medium: 250-400ms — page transitions, modal open
- **Rules:**
  - No spring physics, no bouncing, no elastic easing
  - No entrance animations on page content
  - Hover states: brighten edges or text, never lift cards with shadows
  - Buttons are compact and rectangular. Selection states feel locked-in, not soft-glowing.
  - Alerts read like signals from a system, not friendly nudges.
  - Empty states are procedural and useful, never cute.

## Interaction Patterns
- **Status indicators:** Colored text in quantity cells + 2px left-border stripe on table rows. Minimal use of colored pills. The data IS the indicator.
- **Instrument strip:** Dashboard KPIs as a horizontal band of readouts separated by border dividers, not floating cards. Each cell: tiny uppercase label, large monospace number, delta/trend below.
- **Warning/danger cells:** Cells with critical data get a subtle tinted background (10% opacity of signal color).
- **Forms:** Embedded in workflow, not separate screens. Compact fields, uppercase labels, tight spacing.
- **Navigation:** Sidebar items with icon + label. Active state: amber left-border accent + amber-tinted background.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-30 | Initial design system created | Created by /design-consultation. Three independent design voices (primary + Codex + Claude subagent) converged on industrial/utilitarian direction with amber accent, IBM Plex typography, max 4px radius. |
| 2026-03-30 | Amber accent over blue | Every inventory app uses blue. Amber communicates "operational tool" (caution tape, warehouse signage, equipment highlights). Three voices independently chose amber. |
| 2026-03-30 | Dark-first with light option | Dark "Instrument Panel" as default for extended use. Light "Technical Drawing" available for bright environments. Sidebar stays dark in both. |
| 2026-03-30 | IBM Plex + JetBrains Mono type stack | IBM Plex designed for enterprise/industrial use. JetBrains Mono for display numbers adds tool-grade identity. All open source (SIL OFL), all on Google Fonts. |
| 2026-03-30 | Max 4px border radius | Deliberate departure from category norm (most inventory apps use 12-24px). Sharp corners = precision tool, not friendly app. |
| 2026-03-30 | Instrument strip over metric cards | Horizontal band of readouts with dividers instead of floating cards. Denser, more scannable, more industrial. |
| 2026-03-30 | Brighten --text-dim for WCAG AA | Original #5C5C63 (dark) and #9E9B97 (light) failed WCAG AA contrast for small text. Brightened to #7E7E86 (4.31:1) and #787572 (4.58:1). Sidebar muted #6B6B73 → #82828A (5.09:1). Flagged by /design-review Codex audit. |
| 2026-03-31 | Light mode sidebar: warm stone | Changed from always-dark to theme-aware. Light sidebar uses #EFEEEC (warm stone) to reduce jarring dark/light contrast. Dark sidebar unchanged. |
| 2026-03-31 | Platform-scoped responsive breakpoints | Desktop (Electron) and web (LAN) share the same frontend but use `data-platform` attribute to scope CSS breakpoints. 960/720px breakpoints only apply to web/mobile. Desktop gets graceful compression with 900x600 floor. |
