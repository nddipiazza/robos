# Standalone game distribution

`site/_data/games.json` maps public pages to Godot projects and executable names.
The shared download includes add direct Windows, Linux and macOS downloads to
each game page. `game-downloads.js` selects the visitor's OS, preserves explicit
platform links and checks release availability. Mobile visitors see desktop choices.
Party Game uses App Manager because its TV and agent integrations require RobOS.

The `Standalone game downloads` workflow verifies official Godot downloads,
imports a clean copy of each project, exports native games, and starts the native
Windows and Linux exports headlessly. It publishes the complete set to
`games-v<VERSION>` only when all builds pass. Published assets are immutable:
bump `VERSION` for a different build. Logs and build provenance are retained.

Local Windows build (set `NSIS_BIN` to an installed NSIS compiler for the installer):

```powershell
node scripts/games/setup.cjs
$env:GODOT_BIN = '<path printed by setup>'
$env:NSIS_BIN = 'C:/Program Files (x86)/NSIS/makensis.exe'
node scripts/games/build.cjs quest-warrior-dragon windows
node --test scripts/games/*.test.cjs
```

Outputs are in `release/games/`. The installer runs per user, adds launchers and
an uninstall entry, and offers to play after installation. Uninstall removes only
packaged files and leaves Godot user saves intact. Portable ZIPs include the game
runtime and data; no editor or developer tools are needed.

For itch.io, create a free downloadable project, mark its actual development
status and AI disclosure, upload the same installers/ZIPs, add real gameplay
screenshots and player instructions, and publish. Set `itch_url` only after
verifying that the public storefront works. Keep platform tags accurate.
Existing itch.io projects can also be updated with
`butler push <game.zip> nddipiazza/<slug>:windows --userversion <VERSION>`.
See https://itch.io/docs/butler/pushing.html for authentication and channel names.
