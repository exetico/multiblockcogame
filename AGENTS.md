# Development guide

Common Ground is an original, local two-player falling-block browser game.
Keep branding, visuals, and synthesized audio original.

## Architecture

- `src/engine.js`: DOM-free rules, exported field constants, independent
  seven-piece bags, shared board, score, XP, combos, and park slot.
- `src/input.js`: keyboard and standard Gamepad API input; edge-triggered actions,
  bounded directional repeat, and disconnect detection.
- `src/render.js`: device-pixel-ratio-aware Canvas 2D board and previews.
- `src/audio.js`: gesture-unlocked Web Audio effects; no downloaded audio.
- `src/main.js`: lifecycle, persistence, dialogs, fullscreen, and engine events.
- `src/style.css`: responsive square field and reduced-motion support.

Focus mode is display-only: never change engine dimensions or restart a round
when switching layouts. `applyDisplay()` in `main.js` moves the existing score
and shared dock nodes into sidebars above 700px, restoring them through DOM
anchors on smaller screens or when focus is disabled. Preserve IDs, handlers,
and accessibility; do not duplicate HUD nodes. Canvas resize is handled by
the renderer's ResizeObserver. Grid visibility must not hide overlap markers.
Settings use a non-modal hover panel, with a pointer-leave grace period,
keyboard focus, Escape/outside dismissal, and tap fallback. Do not let hover
steal focus or auto-resume gameplay. All open panels/dialogs, including the
first-visit layout chooser, gate keyboard/gamepad gameplay. Settings/help pause
an active round. Focus defaults to true; Classic stays available. Persist the
layout choice in validated local storage and a path-scoped same-site cookie,
with visible storage errors. Skip/Escape on onboarding selects Focus.

## Required invariants

The user explicitly specified **12 columns by 12 rows**, with **two shared
columns**. Left reach is x=0-6, right reach x=5-11, overlap x=5-6 (zero-based).
Rows clear only across the entire 12-column width.

Active pieces cannot overlap or lock onto an airborne partner. Relays cannot
lock until handed to the other player. Parking is once per piece until a lock;
exchanges do not reset that limit. Park and exchange must be atomic if spawn
space is blocked. Row collapse must preserve a legal airborne partner.

XP depends exclusively on simultaneous rows cleared: 100 / 300 / 600 / 1,000
for 1 / 2 / 3 / 4 rows. Score is separate. Preserve lifetime XP without
double-crediting the current game, and surface storage failures visibly.
There are no networking, server, account, or runtime external dependencies.

## Development

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run dev
```

Node's built-in runner covers engine regressions. Playwright Chromium covers
browser lifecycle, input, persistence, layout, and simulated controllers, and
starts Vite automatically. Add narrow tests for rule changes; do not relax
invariants to pass tests. Keep runtime dependency-free. Pages tests and builds
before deployment. Deployment requires the `ENABLE_PAGES=true` repository
variable and Pages configured to use GitHub Actions. Vite's relative base
supports repository-subpath hosting. Never change repository visibility as
a hosting workaround.
