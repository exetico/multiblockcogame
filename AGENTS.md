# Development guide

Common Ground is an original, local two-player falling-block browser game.
Keep branding, visuals, and synthesized audio original.

## Architecture

- `src/engine.js`: DOM-free rules, exported field constants, independent
  seven-piece bags, shared board, score, XP, combos, and park slot.
- `src/input.js`: keyboard and standard Gamepad API input; edge-triggered actions,
  bounded directional repeat, and disconnect detection. It also contains the
  binding model: `DEFAULT_BINDINGS`, `normalizeBindings`, `assignBinding`
  (swap on conflict), `clearBinding`, `keyLabel`, and `buttonLabel`.
  `Input#setBindings` rebuilds the live keymap.
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
an active round. New visitors default to Immersive (focus true, header/footer
false); Focus and Classic stay available as explicit presets. Persist the
layout choice in validated local storage and a path-scoped same-site cookie,
with visible storage errors. Preserve returning users' layout/menu choices;
legacy Focus/Classic cookies without local preferences keep menus visible.
`viewMode` derives Immersive/Focus/Classic/Custom from focus/header/footer.
`setView` applies presets; individual switches remain available for custom
layouts. Update the layout cookie whenever visibility changes, including menu
recovery, so a stale Immersive cookie cannot hide the header on reload.
Skip/Escape/Continue on onboarding keeps the current view, never forces a new
preset. The introduction is replayable from settings/help, pauses gameplay,
uses live binding labels, and explains hidden-menu recovery and configurable
features. Do not auto-resume or reset the round after dismissal.
The hover-close grace timer must check pointer presence as well as focus:
keep settings open while either the gear or panel is hovered, even after
restoring focus to the game.

## Required invariants

The user explicitly specified **12 columns by 12 rows**, with **two shared
columns**. Left reach is x=0-6, right reach x=5-11, overlap x=5-6 (zero-based).
Rows clear only across the entire 12-column width.

Active pieces may overlap and pass through each other; only settled cells,
field boundaries and the floor are solid. Ghosts ignore falling partners.
First to lock claims the cells. After placement and row collapse, lift an
overlapping partner minimally without changing x/rotation; reset its lock/gravity
timers, not its piece serial or park allowance. Process automatic deadlines in
chronological order (player order breaks exact ties). Relays have
the normal lock deadline: missed handoffs emit a visible notice and lock
normally, rather than freezing. Hard drop locks immediately, with a miss if
untraded. Parking disables parking until a lock or successful exchange.
The replacement drawn by parking stays ineligible; confirmed trades restore
eligibility for both incoming pieces. Requests, cancellations and blocked
trades must not restore it. README tracks confirmation of this provisional rule.
Park and exchange must be atomic if spawn
space is blocked. Row collapse must preserve a legal airborne partner.
Crowded spawns enter in hidden rows (minimum occupied cell y=-2; horizontal
I may use origin y=-3). Top-out occurs when locking above the visible board,
not merely because the default spawn intersects a top-row cell. Falling
partners must not block spawn, park, trade, movement, rotation or save restore.
Tick splits gravity/lock boundaries and counts only actual grounded time.
New-piece serials reset soft-drop repeat and discard stale queued actions.
The frame's pre-input dt must not age pieces spawned by input that frame.
Persist serials in saves; accept missing serials from older stages.
Square rotation accepts input and resets lock time within the fifteen-reset
limit; keyboard repeat applies only to rotation, not park/exchange/hard drop.
Queue individual movement/soft-drop taps too; a set would collapse rapid taps.

XP depends exclusively on simultaneous rows cleared: 100 / 300 / 600 / 1,000
for 1 / 2 / 3 / 4 rows. Score is separate. Preserve lifetime XP without
double-crediting the current game, and surface storage failures visibly.
There are no networking, server, account, or runtime external dependencies.

Defaults use Q/E rotation on the left; Comma/Period rotation, ArrowUp/Enter
hard drop, KeyK park and KeyL exchange on the right. Preserve custom mappings;
`migrateBindings` only upgrades an exact match of both old default keyboards.
Controller setup must be discoverable in the UI and explain
OS-level Bluetooth pairing and browser standard-mapping requirements. Never
claim the browser pairs devices or knows their connection transport. Preserve
connected controllers' side assignments on disconnect; side switching changes
input ownership only and takes place while the setup dialog gates gameplay.
Show controller hints for assigned players and retain keyboard fallback.
Active pieces have no player-colored ownership borders; preserve landing ghosts.
Keep control hints in `.control-player` at the bottom of each desktop sidebar; assigned
controller classes must update both sidebar and corresponding `.control-player`.
Insert score/shared dock before the controls. Focus sidebars use size containment
so their contents cannot enlarge the board row; previews flex into remaining
space. Hints must not consume a separate page row or reduce board height.
Hide hints on narrow screens; keep remapping accessible through the footer.
Pause lives in the header centre, not below the board. Hide-header/footer
preferences persist and reclaim space; hidden headers must retain floating
restore-menu and pause buttons. Hide decorative relay notes unless actionable.
Do not draw player labels beneath active pieces. Preview canvases measure
their rendered dimensions and device pixel ratio; observe their sizes alongside
the board so layout changes redraw previews without blurring or clipping.

Progressive speed defaults on and depends on cleared rows, not wall-clock
time. Off keeps gravity at 900 ms; level, score and XP rules stay unchanged.
Settings changes pause, apply to the current game and persist for new games.

`Game#snapshot` and `Game.restore` implement versioned, DOM-free stage saves.
Validate all board, piece, queue/bag, timer and scoring fields and legal active
piece positions before replacing a game. Restore methods without consuming
random draws, and do not persist events, input state or transient effects.
Three manual slots live under `common-ground-stages-v1`, separate from progress.
Write storage successfully before changing a slot in memory. Report corrupt
slots and storage errors visibly. Loaded games are paused; set `creditedXP`
to their existing XP to avoid crediting it again. Save/load preserves engine
timers, hold limits, relays, pending exchanges and speed mode.
Every dialog gates both input and ticking. New Game pauses even a zero-score
unfinished round and uses two explicit confirmations; cancel never resumes.
Loading over a live round, overwriting and deleting slots require confirmation.
Engine events drive synthesized sound; soft-drop cues are rate-limited.
Do not play storage-success cues before writes succeed.
Browser tests must wait for queued input to reach the HUD before capturing
a baseline, and pause before asserting an unchanged stage.

Piece selection uses independent Fisher-Yates seven-piece bags. Preserve one
of each shape per bag, maximum identical run of two, and maximum twelve-piece
gap between occurrences. Queues contain already-drawn pieces; park/exchange
must not reroll them. Persist remaining bags and queues with stages.

Bindings are data. Never hardcode keys or button indexes in gameplay, hints,
help (`[data-bind]`), or toasts; render them from the current bindings.
Bindings are keyed by `event.code` (one main and one optional extra, max 2 per
action) and standard-mapping button indexes 0-16. Codes are unique across
both players, and buttons are unique within the shared controller map.
Escape, Tab, Meta, Caps Lock, and F-keys are reserved. Validate stored bindings
under `saved.controls`; fall back to the defaults when data is invalid.
`DEFAULT_BINDINGS` must stay immutable. Unbound actions are allowed but
surfaced. The controls dialog gates gameplay and pauses play. Capture
swallows the key (including activation and dialog cancel), and controller
capture accepts only a newly pressed button.

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
