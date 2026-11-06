# /media-watch-status

Where did we leave off? Watch status and play history from RobOS Movie Player and Audio Player, the same on every computer that syncs with your RobOS backup vault (for example on Google Drive).

## Usage

```bash
/media-watch-status show "the office"          # what season / episode we left off on, and what is next
/media-watch-status movie "dune"               # watched it yet?
/media-watch-status continue                   # what we are in the middle of
/media-watch-status watched "the office" --season 2
/media-watch-status next "the office"          # play the next episode in the open Movie Player
/media-watch-status sync                       # sync library + history with the vault now
```

Runs `node packages/movie-player/bin/watch-status.js <args>`, or the `robos-media` MCP server tools
(`node packages/movie-player/bin/media-mcp.js`). See `plugins/robos/skills/media-watch-status/SKILL.md`.
