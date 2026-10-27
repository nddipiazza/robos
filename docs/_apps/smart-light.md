---
title: "RobOS Smart Light"
package: smart-light
category: household
icon: smart-light.svg
summary: "Controls Wi-Fi smart lights on your local network by room, with preset and saved scenes, a circadian color-temperature curve and a status-light mode for CI builds."
description: "RobOS Smart Light sends commands straight to WiZ, WLED, Hue, Kasa, LIFX, Govee, Elgato and other lights on your LAN, with no vendor cloud. Scenes, a daylight curve, an optional AI scene designer and a local REST API sit on top."
related:
  - /apps/robos-tv/
  - /apps/audio-player/
  - /apps/home-speaker/
  - /apps/dev-central/
  - /apps/robos-dashboards/
---

RobOS Smart Light (`packages/smart-light`) is an Electron window over the shared engine `robos-lib/smart-light-engine.js`. The engine builds each vendor's local packet from a light's on/off, brightness, color temperature and RGB color, sends it over UDP, TCP or HTTP, and saves the state. Nothing goes through a vendor cloud.

## Supported lights

You add a light with a name, room, fixture type, protocol, IP address and an optional device key. The port defaults to the protocol's port.

| Protocol | How the engine controls it |
|---|---|
| Philips WiZ | UDP `:38899`, JSON `setPilot` with `state`, `dimming`, `temp` or `r`/`g`/`b` |
| WLED | HTTP `POST /json/state` on `:80` with `on`, `bri` and segment 0 color and effect |
| Philips Hue Bridge | HTTP `PUT /api/<key>/lights/<n>/state` on `:80` (`on`, `bri`, `ct` or `hue`/`sat`) |
| TP-Link Kasa | UDP `:9999`, XOR-171 encoded `transition_light_state` |
| LIFX | UDP `:56700`, binary `Light::SetColor` (102) packet |
| Govee | UDP `:4003`, separate `turn`, `brightness` and `colorwc` JSON messages |
| Elgato Key Light | HTTP `PUT :9123/elgato/lights`, temperature in mireds |
| Yeelight | TCP `:55443`, one JSON-RPC line (`set_power`, `set_rgb` or `set_ct_abx`) |
| Shelly | HTTP `POST /rpc/RGBW.Set` on `:80` |
| Home Assistant | HTTP `POST :8123/api/services/light/turn_on` or `turn_off`, bearer token |

For Hue the device key is `<bridge username>|<light number>`; for Home Assistant it is `<entity_id>|<token>`. Both are stored in plain text in the state file.

Commands are fire-and-forget with timeouts of a few hundred milliseconds. The app does not read state back from a light, never marks a light offline, and saves the new state whether or not the light answered. A UDP send counts as `DISPATCHED` once the packet leaves, even if nothing is at that address; a failed HTTP request is logged as `LOCAL_UPDATED`.

The **Effect Mode** list is shown on every light, but only WLED uses it (as a WLED effect number). LIFX has no separate power-off message here; "off" is sent as brightness 0. Kasa uses UDP only, although the protocol label says UDP/TCP.

### Discovery and pairing

**Scan LAN for Lights** broadcasts a WiZ `getPilot` probe to `255.255.255.255:38899` and a Kasa `get_sysinfo` probe to `:9999`, waits about 350 ms, and adds any WiZ or Kasa light that answers. The status banner says it also scans for WLED, LIFX and Govee; it does not. Add those by IP.

**Pair Hue Bridge** sends `POST /api` with `devicetype: robos#smart-light` to the bridge IP after you press its link button. If the bridge returns a username, every Hue light in the list gets that key and the bridge IP, and the banner says how many lights were updated. If the bridge cannot be reached, answers with an error, or answers without a username, the Hue lights are left as they were and the banner shows the reason. The usual one is the bridge's own `link button not pressed`: press the button and click **Pair** again within 30 seconds.

With `ROBOS_TEST=1` no request is sent. Pairing is simulated with a placeholder `robos-hue-sim-…` key, and the banner says so.

### Demo fixtures

On first run the app seeds five rooms and seven example lights at `192.168.1.81` to `192.168.1.87`, and every change sends real packets to those addresses. Remove the ones you do not own. If you remove every light, the defaults come back the next time the app loads its state.

## Rooms and scenes

The top bar turns all lights in the selected room on or off. Quick buttons set the room to warm white (2700 K), daylight (5200 K), cyan or 25% brightness.

Built-in scenes such as Deep Focus, Cinema & TV Bias, Cozy Amber Evening and Goodnight are defined in the engine. A scene applies to all rooms or to the room in the scope list. Strips and bars get the scene's strip color in RGB plus its effect; other fixtures get the main color or color temperature with no effect. Goodnight turns everything off except a 10%, 2200 K light in the bedroom.

**Save Current Lighting as Scene** does not capture each light. It copies the brightness, color and temperature of the first light that is on in the scope, and the color and effect of the first strip that is on. There is no way to delete a saved scene from the app.

## AI scene designer

You describe a mood ("rainy neon Tokyo coding session") and the app creates a scene, saves it with your custom scenes and applies it.

By default no AI is involved. The prompt is matched against keyword lists for a fixed set of palettes (neon, sunset, ocean, dungeon, forest, focus). A prompt with no matching keyword gets the first palette.

The AI path is opt-in: start the app with `ROBOS_SMART_LIGHT_USE_CLI_AI=1`. The engine then calls `ask()` in `robos-lib/ai-agent` with your text and a request for JSON (`name`, `primaryHex`, `secondaryHex`, `kelvin`, `brightness`, `effect`). That goes to your active AI provider, CLI or API, after the prompt security check. If the call fails or returns no usable JSON, the keyword match is used. There is no switch for this in the window.

## Circadian curve and schedules

The engine maps the hour of the day to a color temperature and brightness: warming from 2500 K at 06:00, 5000–5800 K and 88–100% around midday, falling through the afternoon and evening, and 2200 K at 20% overnight. The tab shows the curve in two-hour steps.

**Sync Lights to Current Solar Time** applies the target for the current time, and a slider applies any hour. Both change only lights that are already on. The sync button also sets a `circadianEnabled` flag, but nothing re-applies the curve as the day goes on.

Schedules have a name, a time, days of the week, a scene, a room scope and fade minutes. Three examples are seeded (07:00 weekday wake-up, 18:30 wind-down, 23:30 auto-off). The add form sets the name, time and scene; new schedules run Monday to Friday with a 15-minute fade.

While the window is open, the engine checks once a minute and runs each enabled schedule whose day and time match. A schedule runs at most once a day. If a check comes a few minutes late (the computer was asleep, or the app opened just after the time), the schedule still runs; after five minutes it waits for its next day. Nothing runs while the app is closed.

The fade moves each light in scope from its current brightness (or from off) to the scene, in steps about 30 seconds apart. Color temperature moves with it, starting from a warm 2200 K for lights that were off, so the wake-up schedule acts like a sunrise. RGB colors switch at the first step. A scene that turns lights off dims them first and turns them off at the end. Changing a light by hand, or applying another scene, takes that light out of a running fade.

**Test Now** applies the schedule's scene at once, without the fade, and does not count as that day's run.

## CI status light

The integrations tab maps four build states to one light: passing (green), building (cyan, breathing), warning (amber) and failing (red, breathing). Pick the target light and click a state to set it.

Nothing in RobOS sets these states on its own. The app does not poll CI. A script or agent can set them through the local API (below). The **Open Dev Central** button only launches [Dev Central]({{ '/apps/dev-central/' | relative_url }}).

The other cross-app buttons work the same way. **Activate TV Bias** applies the Cinema scene to the living room, and the rest launch [Smart TV Studio]({{ '/apps/robos-tv/' | relative_url }}), [Audio Player]({{ '/apps/audio-player/' | relative_url }}) or [Home Speaker]({{ '/apps/home-speaker/' | relative_url }}). No lighting sync with those apps is implemented.

## Local API and protocol inspector

While the window is open the engine serves HTTP on `127.0.0.1:19219`. You can change the port with `ROBOS_SMART_LIGHT_API_PORT`, and the engine picks a free port if 19219 is taken. The API has no authentication and allows requests from any origin.

```bash
curl -s http://127.0.0.1:19219/api/overview
curl -s -X POST http://127.0.0.1:19219/api/ci-status -d '{"status":"failing"}'
curl -s -X POST http://127.0.0.1:19219/api/scene -d '{"sceneId":"scene-cozy-evening","roomScope":"living-room"}'
curl -s -X POST http://127.0.0.1:19219/api/light -d '{"lightId":"light-living-wiz-sofa","brightness":40}'
```

The **LAN Protocol Inspector** tab lists recent commands with an equivalent `nc`, `curl` or `xxd` command line, plus setup steps for each vendor. The header shows an estimated wattage, based on a nominal maximum per light scaled by brightness. It is not measured.

## Where data is stored

- `~/.config/robos/smart-lights.json`: rooms, lights (with device keys and tokens), custom and AI scenes, schedules, CI target and state, and the newest 35 protocol log entries.
- `~/.config/robos/electron/smart-light/`: the Electron profile.

`ROBOS_CONFIG_DIR` moves both. With `ROBOS_TEST=1` the engine sends nothing on the network.

The **Smart Lights** widget in [RobOS Dashboards]({{ '/apps/robos-dashboards/' | relative_url }}) reads this file: how many lights are on out of the total, the active scene and the first few lights. If Smart Light has never saved its state, the widget shows no lights.

## Run it

Open **RobOS Smart Light** from the desktop or the [App Launcher]({{ '/apps/app-launcher/' | relative_url }}). From the repository, run `scripts/dev-launch.sh smart-light`. When the RobOS library is installed, the window runs a DOM-snapshot debug server on port `19209`.

Source: [`packages/smart-light`](https://github.com/nddipiazza/robos/tree/main/packages/smart-light) and [`packages/robos-lib/smart-light-engine.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/smart-light-engine.js). The engine tests are in `smart-light-engine.test.cjs` next to it, and the pairing, schedule and dashboard-widget tests are in `packages/robos-test/tests/smart-light/unit.test.js`.
