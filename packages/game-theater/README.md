# RobOS AI Multiplayer Game Theater (`packages/game-theater`)

**RobOS AI Multiplayer Game Theater** is a dynamic multiplayer game studio, authoritative Node.js HTTP/HTTPS/WSS server, and **Godot 4.3 HTTPS Web Client** where any RobOS Game User can dynamically create, play, and evolve multiplayer games on the fly using the RobOS Agent.

## Key Capabilities

1. **Simple Game Web Server + Godot 4 HTTPS Web Client**:
   - Serves the exported Godot 4.3 HTML5/Wasm client over **Native HTTPS (`:19229`)**, local HTTP (`:19228`), and an optional outbound **`cloudflared` HTTPS tunnel** (`https://*.trycloudflare.com`), paired with a zero-dependency RFC 6455 WebSocket server (`ws://` / `wss://` at `/ws`).
2. **Per-Player Google Doc Launchers & RobOS User Identity**:
   - Uses the exact same Google Drive v3 + Google Docs capability-token launcher approach as `packages/google-calendar` and `packages/shopping-lists`.
   - Creates one dedicated Google Doc per RobOS player (`RobOS Game Theater — <Player Name> (Player Launch Doc)`) with a prominent 1-click Launch Button (`?auth=<256-bit-token>`), shared directly with that player's email address.
3. **Multiplayer Lobby & Seat Enforcement**:
   - Real-time lobby presence, player seats, chat, per-player hidden-information view scoping (`getPlayerView(state, viewerUid)`), and strict `minPlayers` / `maxPlayers` enforcement.
4. **Dynamic AI Game Generation & Live Modification**:
   - Starts with a blank stage — no games are hardcoded into the app.
   - Any authenticated RobOS Game User in the lobby (or desktop studio / CLI) can prompt the RobOS Agent to generate a brand-new multiplayer game (`manifest.json` + `server.js` + Godot 4 `client.gd`) or modify the active game.
   - Every generated bundle is automatically validated in a sandboxed Node `vm` and compiled in headless `godot4` (`scripts/validate_client.gd`) with automatic self-repair before hot-reloading live to all connected browsers.

## Commands

```bash
# Start HTTP (:19228) + Native HTTPS (:19229) + Outbound HTTPS Tunnel
node packages/game-theater/serve.js

# Sync per-player Google Launch Docs to Google Drive
node packages/game-theater/bin/game-theater.js sync-docs

# Dynamically generate a multiplayer game with the RobOS Agent
node packages/game-theater/bin/game-theater.js generate "Create a 2-player Hangman game..." --title "Hangman"

# Run unit & WSS multiplayer tests
node --test packages/robos-test/tests/game-theater/unit.test.js
```
