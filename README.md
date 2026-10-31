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
| Rotate clockwise | W | ↑ | A / Cross |
| Rotate counterclockwise | Q | / | B / Circle |
| Hard drop | Space | Enter | X / Square |
| Park / retrieve | C | . | Y / Triangle |
| Request / confirm exchange | V | , | Either bumper |
| Pause / resume | Escape | Escape | Start / Options |

Connect a controller and press a button for browser detection. The **first
controller plays right**, leaving the left keyboard controls for your partner.
A second controller plays left. Both keyboard mappings remain active. Standard
Gamepad API mappings are required; unsupported mappings show a notice.
Gamepad access requires HTTPS or localhost.

Click **Let's play**, or press a controller's A / Cross / Start, to start.
Upper-right buttons toggle synthesized sound, enter fullscreen, or open the
field guide. Leaving the tab, losing window focus, opening help, or disconnecting
a controller pauses play. Resume when both players are ready. Some keyboards
cannot register many simultaneous keys; controllers avoid keyboard ghosting.

## Score and XP

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
current round. Best score, lifetime team XP, sound, and relay preferences are
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