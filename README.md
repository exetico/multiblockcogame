# Common Ground

**Two players. One 12 × 12 field. Fall together.**

An original local co-op falling-block game for a single browser and screen.
No accounts, server, matchmaking, or runtime third-party services. Keyboard and
standard controllers work together. Desktop/laptop browsers are recommended:
the layout scales to small screens, but touch controls are not included.

**Hosted URL after enabling Pages:** https://exetico.github.io/multiblockcogame/

## How to play

Each player can move within seven columns. The **middle two columns overlap**:
both players can place pieces there, but active pieces cannot pass through each
other. Complete a row across **all 12 columns** to clear it. If either player
tops out, the round ends for the team.

- **Shared park:** store your current piece or swap with the parked one. Either
  player can take it. You can park once per active piece until you lock it.
- **Exchange:** request a trade; your partner presses their exchange button to
  confirm. Both pieces respawn upright on their new sides. Press your own
  exchange button again to cancel. Blocked spawn areas prevent a trade without
  consuming either piece.
- **Relays:** every tenth piece per player is marked `⇄`. It must change hands
  before it can lock. Exchange it, or park it for your partner. Taking your own
  parked relay does not count as a handoff. Disable relays on the start or
  game-over screen for a simpler game.
- **Fundamentals:** independent seven-piece bags, wall-kicked rotation, ghost
  landings, three-piece previews, soft/hard drops, 500 ms lock delay with up to
  15 movement/rotation resets, rising gravity, combos, back-to-back clears, and
  three-corner T-spin recognition.

This is not an exact reproduction of a commercial game. The 12 × 12 geometry
and overlap follow the requested Shared Mode; branding, visuals, sounds,
relay cadence, scoring, and input mappings are original choices.

## Controls

| Action | Left player | Right player | Standard controller |
|---|---|---|---|
| Move | A / D | ← / → | D-pad or left stick |
| Soft drop | S | ↓ | Down |
| Rotate clockwise | E | . | A / Cross |
| Rotate counterclockwise | Q | , | B / Circle |
| Hard drop | Space | ↑ / Enter | X / Square |
| Park / retrieve | C | K | Y / Triangle |
| Request / confirm exchange | V | L | Either bumper |
| Pause / resume | Escape | Escape | Start / Options |

These are the defaults. **Every key and controller button can be changed** under
**CONTROLS** in the footer (also linked from display settings and the
controller guide). See [Custom controls](#custom-controls).

Connect a controller and press a button for browser detection. The **first
controller plays right**, leaving the left keyboard controls for your partner.
A second controller plays left. Both keyboard mappings remain active. Standard
Gamepad API mappings are required; unsupported mappings show a notice.
Gamepad access requires HTTPS or localhost.

Rotation defaults are paired: Q/E on the left keyboard and comma/period on
the right. Up instantly drops the right player's piece; K parks and L trades.
Keys use physical positions. Existing custom mappings are preserved; unchanged
old default keyboards are upgraded to these defaults automatically.

**Controller setup is visible in the footer and clickable player device labels.**
Open it for USB/Bluetooth steps, live detected device names, player assignments,
and a **Switch controller sides** button. Pair Bluetooth controllers in your
operating system's settings, or connect using a USB data cable; then return to
the game and press a controller button. The game cannot perform Bluetooth
pairing or determine whether a detected controller uses USB or Bluetooth.
Compatibility depends on the device, OS, and browser's standard mapping.
Connected players see controller button hints instead of keyboard hints.
If a controller disconnects, the remaining controller keeps its side; the round
pauses rather than silently handing it to the other player.

Active blocks have no ownership borders or player labels.
Outlined ghosts indicate landing positions.

Click **Let's play**, or press a controller's A / Cross / Start, to start.
Upper-right buttons toggle synthesized sound, enter fullscreen, or open the
field guide. Leaving the tab, losing window focus, opening help, or disconnecting
a controller pauses play. Resume when both players are ready. Some keyboards
cannot register many simultaneous keys; controllers avoid keyboard ghosting.

## Pause, new game and saved stages

The prominent **Pause** button in the header centre,
Escape, and the controller pause button all pause/resume. Opening
settings, help or the memory card pauses immediately. Closing a panel never
resumes automatically.

**New Game** pauses an unfinished round and asks twice before discarding it.
Cancel or Escape keeps the round paused. Save it first if you want to return;
new games never erase save slots, best score or lifetime XP.

The **memory-card icon** in the toolbar opens **three manual save slots**.
Save a paused round to an empty slot, or confirm before overwriting a slot.
Each card shows its timestamp, score, rows, level and speed mode. Load restores
the board, both pieces (position/rotation), queues/bags, shared park, exchange
request, relay state, timers, score and XP. It stays paused until you resume.
Replacing an unfinished round or deleting a slot requires confirmation.
Finished rounds cannot be saved.

Stages are stored locally under `common-ground-stages-v1`, separately from
preferences/progress. They survive reloads in this browser on this device;
they are not cloud saves or automatic checkpoints. Clearing site data removes
them. Unreadable saves and storage failures are reported without loading a
broken stage or claiming that a failed write succeeded. Loading does not
award a saved stage's existing XP again; subsequent clears earn new XP.

## Custom controls

Open **CONTROLS** in the footer. Choose a tab: **Left keyboard**, **Right
keyboard**, or **Controller**. Select a slot and press the key or controller
button you want to use. Each action has a main binding and an optional extra
binding.

- **Escape cancels** a capture and always pauses the game, so it cannot be
  assigned. Tab, Windows/Command, Caps Lock, and F1-F12 are also reserved.
- Choosing a key or button that is already in use **swaps** the two bindings.
  The status line shows what moved. If an action ends up without a binding,
  it is marked **UNBOUND** until you assign one.
- **×** removes a binding. **Reset this set** restores the defaults for the
  current tab. **Reset all** restores every binding.
- Controller bindings apply to both controllers. The left stick always moves.
  Pause defaults to Start / Options.
- Bindings use physical key positions. In Chromium-based browsers, labels show
  your layout's characters, such as Æ and Ø on Danish keyboards.
- Changes take effect immediately. On-screen hints, help, and toasts update,
  and the bindings are saved in this browser. Invalid saved bindings fall back
  to the defaults.

## Focus mode and display settings

**Focus is the default layout.** On your first visit, an overlay lets you
choose Focus (recommended) or Classic for your screen. Skip or press Escape
to use Focus. Your choice is remembered in local storage and a one-year,
same-site preference cookie scoped to this game's path; there is no tracking.
Existing progress and preferences are preserved.

The round **layout icon** beside fullscreen switches between Focus and Classic
without restarting the round. Focus expands the playfield without entering
browser fullscreen. On wide screens, the team score and XP move to the left sidebar,
and the shared park and exchange status move to the right. The header is
shorter, keyboard hints use compact rows, and the square field uses the
available screen height (or width on narrower screens). On phones, score and
shared space remain above/below the board to keep it readable.
Control hints sit at the bottom of each desktop sidebar, beneath score or
shared park. They do not reserve a row below the board or reduce its height.
On narrow screens the hints are hidden; the controls dialog remains available.
Side labels appear once; relay/park notes show only actionable
messages. The redundant board labels and bottom status bar are removed.
Next-piece previews expand into the available sidebar height, and the shared
park is larger. Preview canvases use their displayed size and device pixel
ratio so blocks stay sharp rather than stretching a small image.

**Hover over the gear** to open settings: focus mode, grid lines,
control hints, header/footer visibility and progressive speed. Move away to close it. Keyboard focus also opens the panel;
touch users can tap the gear. Escape, Done, or clicking outside closes it.
Turning grid lines off keeps the two shared columns highlighted. Preferences
persist in this browser and do not alter the **12 × 12 rules**, reset your
round, or change XP/scoring. Opening settings pauses an active game; closing
them leaves it paused until you resume. The toolbar layout toggle itself does
not pause or restart play. Fullscreen remains a separate option.

Hide **Top menu** or **Footer** independently in settings to recover board space.
A floating menu button restores a hidden header, and a floating pause button
remains usable alongside Escape/controllers. Restore the footer in settings.
These preferences survive reloads. Control hints can be hidden separately.

**Progressive speed is on by default.** Falling gets faster every ten cleared
rows, not with elapsed time: the interval starts at 900 ms, multiplies by 0.79
each level, and stops accelerating at 65 ms. Turn it off in settings for a
steady 900 ms pace. Changing it pauses play and applies to the current round;
the preference also applies to new rounds and is included in saved stages.
Levels and score multipliers still advance normally, and XP is unchanged.
Soft/hard drop and the 500 ms lock delay work the same in either mode.

Synthesized sound cues cover movement, rotation, soft/hard drop, locking,
parking, exchange requests/trades, row clears, level-ups, pause/resume,
saving/loading and blocked-action notices. Soft-drop ticks are rate-limited
and quiet; all effects respect the sound toggle.

## Score and XP

### Piece selection

Each player has an independent **shuffled seven-piece bag**. A bag contains
exactly one of every shape; a Fisher-Yates shuffle chooses their order.
After all seven have been drawn, a fresh bag is shuffled. Preview pieces are
already drawn and are not reshuffled when parked or exchanged.

This is balanced randomness, not an unrestricted random choice each time:
each shape appears once per bag, no shape repeats more than twice consecutively,
and at most twelve other pieces can occur between two appearances of a shape.
Pairs can repeat across bag boundaries, and runs of the two zigzag shapes can
reach four. It is intentionally more predictable and less prone to unfair
droughts than unrestricted draws or a simple repeat-reroll rule. Players' bags
are separate, so matching pieces on both sides are normal. Saves preserve both
queues and remaining bags.

| Simultaneous rows | Base score × level | Team XP |
|---|---:|---:|
| 1 | 100 | 100 |
| 2 | 300 | 300 |
| 3 | 500 | 600 |
| 4 | 800 | 1,000 |

Soft drop adds 1 point per cell; hard drop adds 2. Three-corner T-spins give
400 / 800 / 1,200 / 1,600 base points for 0 / 1 / 2 / 3 rows. Consecutive
four-row or line-clearing T-spin clears receive a 50% back-to-back score bonus.
Consecutive row clears add 50 × combo index × level. An ordinary row clear
ends back-to-back; a no-clear lock ends the combo.

XP comes **only from cleared rows**. Every ten total rows raises the level.
The progress bar shows rows toward the next level; the XP value is for the
current round. Best score, lifetime team XP, sound, relay, display preferences, and custom controls are
saved in browser storage under `common-ground-v1`. New rounds retain earned
progress. No personal data is sent anywhere. Storage failures show a notice.

## Run locally

Requires Node.js **22.12+** (or 20.19+) and npm.

```sh
npm ci
npm run dev
```

Open Vite's localhost URL. Both players use that one page.

```sh
npm test                         # Deterministic engine tests, no browser
npm run build                    # Production files in dist/
npm run preview                  # Serve production files locally
npx playwright install chromium
npm run test:browser              # Browser + simulated controller checks
```

Fresh Linux machines may need browser libraries:
`npx playwright install --with-deps chromium`.

## Deploy and maintain

In repository **Settings → Pages**, choose **GitHub Actions** as the source.
Then in **Settings → Secrets and variables → Actions → Variables**, add the
repository variable **`ENABLE_PAGES`** with value **`true`**, and run the
`Test and deploy` workflow (or push to `main`). Deployment is opt-in because
Pages cannot be enabled with the session's current token. The repository
remains private; Pages hosting for private repositories requires an eligible
GitHub plan. Do not change visibility just to deploy without the owner's consent.

The workflow checks the engine, Chromium browser behavior, and production
build on `main` and pull requests; deployment runs only when enabled.
Build output works on any static host. Runtime has no external fonts,
remote images, or downloaded audio.

See [AGENTS.md](AGENTS.md) for architecture, invariants, and development guidance.
The project uses native JavaScript modules and Canvas 2D; Vite and Playwright
are development-only dependencies.