# RobOS Game Server

The RTS service hosts one Starfall Command 1v1 match at a time. It runs the same 64 Hz simulation as the game and sends both clients the same ordered command stream over ENet/UDP. The service handles the lobby and match directly.

## Host a match

From the repository root, run this with Node.js 20 or later and Godot 4.3. Use `--godot` to point to your executable, set `GODOT_BIN`, or put `godot` on `PATH`.

```powershell
node packages/robos-game-server/server.mjs --godot 'C:\path\to\Godot.exe' --bind 0.0.0.0
```

1. Start the same native game build on both computers. On the title screen, select **Online 1v1**.
2. Enter the host's reachable LAN or VPN address and UDP port **18110**, then pick a faction and select **Join**. When running both clients on the host, use `127.0.0.1`.
3. The match starts once both players join and load the map. A disconnect during play awards the other player a win. Both players can return to the title screen and join again after the room clears.

The launcher binds to loopback by default. For remote players, bind to the intended network interface and allow the game port through the host firewall. `--port` selects a different UDP port. `--map` accepts `iron-narrows` (default), `frontier-hunters`, or `glassline-basin`. Set `RTS_ROOM_CODE` in the server environment to require a matching room code from both clients.

## Watch two AI commanders

In **Online 1v1**, use **AI vs AI · Frontier Hunters**. Choose a faction or **Random** for each commander and select **Create AI lobby**. An optional second client can select **Join as viewer** at the same address. Select **Start AI match** on the first client. Press **O** to cycle the full map and each commander's camera and fog of war. The server runs both commanders through the end of the match. Use `--seed` to repeat the same starting sites and faction rolls.

Use the MVP on a trusted LAN or private VPN. Each client simulates the whole match, including units outside its current vision. The optional room code travels over the unencrypted game connection. Matches use direct connect with no mid-match reconnect.

## Run the two-client test

With Python 3, a desktop graphics session, and UDP port 18110 free, run the test from the repository root. It opens two rendered clients, starts a server, and saves logs and screenshots to the supplied directory. It also starts a second match on the same server to verify room reuse and disconnect handling.

```powershell
python packages/robos-game-server/test_online.py 'C:\path\to\Godot.exe' "$env:TEMP\starfall-online-proof"
```

Add `--ai` to watch a seeded Random vs Random match on two rendered clients. The test accelerates the server clock and checks that both viewers agree with the server's final result.

Add `--ai --viewer-lifecycle` to run another match on the same server, open the match menu, and disconnect both viewers. The test waits for the unobserved match to reach the same server result.

On Windows, add `--ai --record` with FFmpeg on `PATH` to run at normal speed and save `frontier-hunters-online-ai.mp4` with the game's audio. The automated test launches both viewers on the same machine.

Add `--concord` to an AI run to choose Concord versus Gnarl through the menu and verify that both viewers observe a Transit Waystone deployment before the match ends.

Automated AI runs use threefold server speed by default. Set `RTS_TEST_SERVER_SPEED=1` to exercise the normal game clock. A run with `--record` always uses normal speed.
