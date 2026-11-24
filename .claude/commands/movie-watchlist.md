# /movie-watchlist

Manage your **RobOS Movie Player** Watchlist and episode cursor from the CLI, MCP, or **RobOS Voice Assistant** — add or remove shows and movies, mark all episodes as new/unwatched, or set *"my/our current episode of {show} is {ep}"* (marking prior episodes watched and current+ unwatched).

## Usage

```bash
/movie-watchlist list                                     # list My Watchlist + Continue Watching
/movie-watchlist add "Severance"                          # add show or movie to Watchlist
/movie-watchlist remove "Family Guy"                      # remove show or movie from Watchlist & Continue Watching
/movie-watchlist mark-new "Severance" [--season 2]        # mark all episodes (or a season) as new / unwatched
/movie-watchlist current "Family Guy" "S21E05"            # mark prior episodes watched & S21E05+ unwatched
/movie-watchlist say "our current episode of Severance is season 2 episode 4"
```

Runs `./packages/robos-cli/robos-movie-watchlist <args>`, `node packages/movie-player/bin/watch-status.js <args>`, or the `robos-media` MCP server (`node packages/movie-player/bin/media-mcp.js`). See `plugins/robos/skills/movie-watchlist/SKILL.md`.
