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

## Midterms 2026

`midterms-2026` is a standalone edition of the existing
`election-2026-quest-1` cartridge and its modeled KGraph map
`urn:robos:tabletop:map:election-2026-quest-1`. It uses the Tabletop engine without
duplicating the game source. Staging sets the product title and default
cartridge, retains that cartridge's movies and excludes other campaigns.
The original Tabletop project retains its default campaign and cartridge list.

The `Midterms 2026 standalone and browser game` workflow builds Windows,
Linux, universal macOS and Web packages into a separate immutable release,
`midterms-2026-v<VERSION>`. Set `GAME_RELEASE_PREFIX=midterms-2026-v` when
running `build-all.cjs` or `publish.cjs` locally. Native startup checks verify
that the packaged game loads the election campaign with no command-line flags.

The Web ZIP has `index.html` at its root and uses Godot's single-threaded
Compatibility renderer. Native TCP telemetry is disabled on Web. It runs
without a server-side AI service or cross-origin isolation headers. Upload it
as an HTML game on itch.io, mark the ZIP as playable in-browser and use a
click-to-launch fullscreen player. Keep desktop downloads as platform-tagged
files. Desktop browsers with mouse and keyboard are the supported web target.

Verification: open the exported HTML through an HTTP server, commence the quest,
complete spell selection, roll movement dice and move a hero. Check browser
errors, and check the final itch.io player after publishing. The campaign's
existing full AI playthrough and report remain linked from its own game page.
