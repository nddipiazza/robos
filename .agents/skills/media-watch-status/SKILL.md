---
name: media-watch-status
description: Answer where the user left off in a TV show or movie across all their computers ("what season of The Office did we leave off on?", "have we seen Dune?", "what are we watching?"), list Movie Player and Audio Player history, mark episodes or seasons watched, play the next episode, and sync the libraries and history with the RobOS backup vault on Google Drive.
---

# Media Watch Status

RobOS Movie Player and Audio Player keep a portable watch / play history in
`~/.config/robos/media-history/<movie-player|audio-player>.json`, keyed by what the media is
(`tv:<show>:s<season>:e<episode>`, `movie:<title>:<year>`, `audio:<artist>:<album>:<title>`)
instead of where its file lives. RobOS Preferences → Config Sync → **Backup vault** ("Back up to
my Google Drive") syncs it, with the players' folders and playlists, to every computer; two
computers that both watched something merge entry by entry, never conflict. So the answer is the
same on every computer, and no app has to be running to ask.

## Input

`$ARGUMENTS` — what to do:
- `show "<name>"` — where you left off in a show, what is next, per-season counts
- `movie "<title>"` — finished, in progress, or not watched
- `continue` — shows and movies in progress
- `shows` — every show with watched / in-progress counts
- `history [--audio] [--limit N]` — recently watched (or played songs with `--audio`)
- `watched "<show>" [--season N] [--episode N] [--unwatched]` — mark watched / unwatched
- `next "<show>"` — play the next episode (Movie Player must be open)
- `sync` — sync both players' library and history with the backup vault now

## Procedure

1. **Prefer the MCP tools** when the `robos-media` MCP server is connected
   (`claude mcp add robos-media -- node packages/movie-player/bin/media-mcp.js`):
   `robos_media_watch_status`, `robos_media_movie_status`, `robos_media_continue_watching`,
   `robos_media_list_shows`, `robos_media_watch_history`, `robos_media_set_watched`,
   `robos_media_play_next_episode`, `robos_media_sync_now`.
2. **Otherwise run the CLI** (same answers):
   ```bash
   node packages/movie-player/bin/watch-status.js show "the office"
   node packages/movie-player/bin/watch-status.js movie "dune" --json
   node packages/movie-player/bin/watch-status.js watched "the office" --season 2
   node packages/movie-player/bin/watch-status.js sync
   ```
   Without `--json` it prints the sentence RobOS Voice would say.
3. **Say the answer**: every status result has a `spoken` field. To answer out loud:
   ```bash
   ./packages/robos-cli/robos-voice speak "$(node packages/movie-player/bin/watch-status.js show 'the office')"
   ```
4. **From another app or script while the Movie Player runs**, use its control API
   (`~/.config/robos/movie-player-control.json` holds the port and token; send `X-RobOS-Token`):
   `GET /api/watch-status?show=`, `GET /api/movie-status?title=`, `GET /api/continue-watching`,
   `GET /api/history?kind=tv|movie`, `GET /api/shows`, `GET /api/media-sync`,
   `POST /api/set-watched {show, season?, episode?, watched?}`, `POST /api/play-next-episode {show}`,
   `POST /api/media-sync-now`. In Node: `require('robos-lib/media-watch')`.
5. **Voice** needs nothing extra: RobOS Voice and Home Speaker ("Hey Nabu…") route
   "what season of X did we leave off on", "where did we leave off on X", "what episode are we on
   in X", "have we seen X", "what are we watching" and "continue watching X" here
   (`home-speaker/lib/nabu-command-router.js` → `parseWatchStatusQuery`).

## If the answer is missing or stale

- "could not find a show" — the show is not in this computer's library index or history yet. Check
  Movie Player → Library → folders (a Google Drive folder synced from another computer is indexed
  when the player starts) and spelling.
- Other computer's latest episode missing — run `sync` (or `robos_media_sync_now`). If it says no
  vault is connected, open RobOS Preferences → Config Sync → Backup vault → **Use my Google Drive**
  on both computers. If it reports conflicts, they are in folders or playlists (never in history):
  resolve them in Preferences.

## Validation

- `node --test packages/robos-test/tests/media-watch/unit.test.js` (two computers, one in-memory Google Drive)
- `show` returns `ok: true`, a `lastWatched` with `season`/`episode`, and a `spoken` sentence.
