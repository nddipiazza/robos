---
title: "RobOS Game Server"
package: robos-game-server
category: "libraries"
component_type: component
permalink: /robos-game-server/
redirect_from:
  - /apps/robos-game-server/
summary: "Host a direct-connect Starfall Command match or run an AI matchup for spectators."
description: "Run the Starfall Command dedicated game server and connect two players or AI spectators over a trusted LAN or private VPN."
---

The RobOS Game Server hosts one Starfall Command match at a time. Both players run the same game build and join using the host’s address and UDP port. The server also runs AI matches on Frontier Hunters that players can join as spectators.

The server requires Node.js 20 or later and Godot 4.3. From the repository root, run:

```sh
node packages/robos-game-server/server.mjs --map frontier-hunters
```

For two clients on the host machine, select **Online 1v1** and connect to `127.0.0.1` on UDP port `18110`. For a trusted LAN or private VPN, use `--bind` with the intended network interface and connect using the host’s reachable address. See the [server README](https://github.com/nddipiazza/robos/blob/main/packages/robos-game-server/README.md) for setup and test commands.

[Starfall Command]({{ '/games/robos-rts/' | relative_url }})
