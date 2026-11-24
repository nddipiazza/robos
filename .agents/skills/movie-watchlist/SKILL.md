---
name: movie-watchlist
description: Manage your RobOS Movie Player watchlist and episode cursor via CLI, MCP, AI agents, or RobOS Voice Assistant ("add {show} to my watch list", "remove {show} from my watch list", "mark all episodes of {show} as new", "my/our current episode of {show} is {ep}").
---

# Manage RobOS Movie Player Watchlist & Episode Progress

Use this skill whenever the user wants to inspect or manage what is on their **RobOS Movie Player** Watchlist, remove a show or movie from their Watchlist / Continue Watching, reset all episodes of a show as new/unwatched, or set their current episode cursor (e.g., *"my/our current episode of {show} is {exp}"*).

All changes apply **immediately** to the open RobOS Movie Player window (updating `My Watchlist`, `Continue Watching`, `Watch History`, and episode badges live via `~/.config/robos/movie-player-control.json`), persist when Movie Player is closed (`~/.config/robos/movie-track-stats.json`, `~/.config/robos/movie-playlists.json`, and `~/.config/robos/media-history/movie-player.json`), and sync to **RobOS Media Server** (`POST /api/progress` batch endpoint) and the **RobOS Config Sync** backup vault.

---

## Supported Operations & Exact Semantics

1. **List Watchlist (`list` / `watchlist`)**
   - Lists TV shows and movies in **My Watchlist** (`loved: true` + `Watch Later` playlist) and active **Continue Watching** shows, including each show's next episode (`SxxExx`).
2. **Add Show or Movie to Watchlist (`add "<show or movie>"`)**
   - Fuzzy-matches the show or movie in the Movie Player library, marks `loved: true` (`♥ My Watchlist`), clears any prior watchlist dismissal, updates the live UI, and syncs to RobOS Media Server.
3. **Remove Show or Movie from Watchlist (`remove "<show or movie>"`)**
   - Clears `loved: false` across all episodes of the show (or movie), removes matching tracks from custom Watchlist playlists (`movie-playlists.json`), clears any paused mid-episode `inProgress` resume point, and marks `dismissedFromWatchlist: true` so the show disappears from **both** `My Watchlist` and `Continue Watching` without erasing previously watched history.
4. **Mark All Episodes as New / Unwatched (`mark-new "<show>" [--season <N>]`)**
   - Resets every episode of `{show}` (or of season `N`) to brand-new unwatched state (`completed: false, inProgress: false, positionSec: 0, progressPct: 0, plays: 0, lastPlayed: null, resetPlays: true`) locally, in portable history, and on RobOS Media Server.
5. **Set Current Episode Cursor (`current "<show>" "<exp>"`)**
   - Implements *"my/our current episode of {show} is {exp}"*:
     - Every episode **strictly before** `{exp}` in chronological `(season, episode)` order is marked **Watched** (`completed: true, progressPct: 100`).
     - `{exp}` itself **and every episode after `{exp}`** is marked **Unwatched / New** (`completed: false, inProgress: false, positionSec: 0, plays: 0`).
     - As a result, `{show}`'s **Continue Watching / Next Up** pointer lands directly on `{exp}`!
   - `{exp}` accepts shorthand codes (`S02E04`, `s2e4`, `2x04`), spoken numbers (`season 2 episode 4`, `season twenty one episode five`), season-only (`season 3` → `S03E01`), episode-only (`episode 5`), or an episode title (`"Dinner Party"`).
6. **Import Watch History File (`import [<file>] [--account <name>] [--no-audio]`)**
   - Imports watch & play history files from **Plex Watch History JSON** (`plex-watch-history.json`), raw Plex `MediaContainer` JSON, **Tautulli / Jellyfin / Trakt JSON**, **Letterboxd / Trakt CSV**, or **RobOS Portable Media History JSON**.
   - Canonicalizes show & movie titles across folder naming variants (`Ghosts (US)` / `Ghosts`, `Travelers (2016)` / `Travelers`, `Stargate SG-1` / `Stargate SG1`, while keeping year-distinct remakes like `Avatar (2024)` separate from `2005`), aggregates duplicate play timestamps idempotently, updates **Movie Player** (`movie-track-stats.json` + `media-history/movie-player.json`), **Audio Player** (`audio-track-stats.json` + `media-history/audio-player.json`), and pushes batch progress to **RobOS Media Server** (`POST /api/progress`).
   - Also available directly inside **RobOS Movie Player → Watch History → Import History…** (or by dragging & dropping a `.json`/`.csv` file onto the Watch History tab).

---

## CLI Usage

```bash
# List everything on your Movie Player Watchlist + Continue Watching
./packages/robos-cli/robos-movie-watchlist list
./packages/robos-cli/robos-movie-watchlist list --json

# Add or remove a show or movie on your Watchlist
./packages/robos-cli/robos-movie-watchlist add "Severance"
./packages/robos-cli/robos-movie-watchlist remove "Family Guy"

# Mark all episodes of a show (or one season) as brand new / unwatched
./packages/robos-cli/robos-movie-watchlist mark-new "Severance"
./packages/robos-cli/robos-movie-watchlist mark-new "Severance" --season 2

# Set your current episode cursor (marks prior episodes watched, current+ unwatched)
./packages/robos-cli/robos-movie-watchlist current "Family Guy" "S21E05"
./packages/robos-cli/robos-movie-watchlist current "Severance" "season 2 episode 4"
./packages/robos-cli/robos-movie-watchlist current "The Office" --season 3 --episode 5

# Import a Plex / Tautulli / Trakt / CSV watch history file (auto-discovers ~/Downloads/*watch-history* if path omitted)
./packages/robos-cli/robos-movie-watchlist import ~/Downloads/plex-watch-history.json
./packages/robos-cli/robos-movie-watchlist import ~/Downloads/plex-watch-history.json --account "nicholas.671"

# Run any natural-language voice phrase directly from CLI
./packages/robos-cli/robos-movie-watchlist say "our current episode of Severance is season 2 episode 4"
./packages/robos-cli/robos-movie-watchlist say "remove Family Guy from my watch list"
./packages/robos-cli/robos-movie-watchlist say "mark all episodes of The Office as new"
```

The same commands are also available on `packages/movie-player/bin/watch-status.js`:

```bash
node packages/movie-player/bin/watch-status.js watchlist
node packages/movie-player/bin/watch-status.js add "Severance"
node packages/movie-player/bin/watch-status.js remove "Family Guy"
node packages/movie-player/bin/watch-status.js mark-new "Severance"
node packages/movie-player/bin/watch-status.js current-episode "Severance" "S02E04"
```

---

## RobOS Voice Assistant Commands

Both **RobOS Voice Desktop Assistant** (`packages/voice-prompt`, port `:19188`, `robos-voice assistant "..."`) and **RobOS Home Speaker / Nabu** (`packages/home-speaker/lib/nabu-command-router.js`) handle these spoken utterances natively and speak back a concise confirmation:

- **Inspect Watchlist**:
  - *"What's on my watch list?"* / *"Read our movie watchlist"* / *"Show my watchlist"*
- **Add to Watchlist**:
  - *"Add Severance to my watch list"* / *"Put Dune on our watchlist"*
- **Remove from Watchlist**:
  - *"Remove Family Guy from my watch list"* / *"Take Severance off our watch list"* / *"Remove The Office from continue watching"*
- **Mark All Episodes as New / Unwatched**:
  - *"Mark all episodes of Severance as new"* / *"Mark Family Guy as unwatched"* / *"Mark season 2 of Severance as new"* / *"Reset watch progress for The Office"*
- **Set Current Episode Cursor**:
  - *"My current episode of Family Guy is S21E05"*
  - *"Our current episode of Severance is season 2 episode 4"*
  - *"Update The Office to season 3 episode 5"*
  - *"We are on season 2 episode 3 of Breaking Bad"*
  - *"Mark Severance watched up until S02E04"*

Test via the RobOS Voice CLI:

```bash
./packages/robos-cli/robos-voice assistant "my current episode of Family Guy is season 21 episode 5"
./packages/robos-cli/robos-voice assistant "remove Family Guy from my watch list"
./packages/robos-cli/robos-voice assistant "mark all episodes of Family Guy as new"
```

---

## MCP Tools (`packages/movie-player/bin/media-mcp.js`)

The `robos-media` MCP server exposes:
- `robos_media_watchlist` — list the Movie Player Watchlist + Continue Watching
- `robos_media_watchlist_add` — `{ query, kind? }`
- `robos_media_watchlist_remove` — `{ query, kind? }`
- `robos_media_mark_episodes_new` — `{ show, season? }`
- `robos_media_set_current_episode` — `{ show, ep?, season?, episode? }`

---

## Key Implementation Files

- `packages/robos-lib/media-history.js` — `parseEpisodeSpec`, `findWatchlistTarget`, `watchlistSummary`, `planCurrentEpisode`
- `packages/robos-lib/media-watch.js` — `watchlist`, `addToWatchlist`, `removeFromWatchlist`, `markAllNew`, `setCurrentEpisode`
- `packages/movie-player/main.js` & `packages/movie-player/lib/control-server.js` — live loopback endpoints (`/api/watchlist`, `/api/watchlist-add`, `/api/watchlist-remove`, `/api/mark-episodes-new`, `/api/set-current-episode`)
- `packages/home-speaker/lib/nabu-command-router.js` & `packages/voice-prompt/lib/skills-executor.js` — natural-language voice intent parser and spoken response router
- `packages/robos-cli/robos-movie-watchlist` — standalone CLI entrypoint
