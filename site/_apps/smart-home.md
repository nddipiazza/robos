---
title: "RobOS Smart Home"
package: smart-home
category: household
icon: smart-home.svg
redirect_from:
  - /apps/smart-light/
summary: "Controls Wi-Fi smart lights on your local network by room, with preset and saved scenes, a circadian color-temperature curve and a status-light mode for CI builds. Also shows the status of your LG washer, dryer and refrigerator."
description: "RobOS Smart Home sends commands straight to WiZ, WLED, Hue, Kasa, LIFX, Govee, Elgato and other lights on your LAN, with no vendor cloud. Scenes, a daylight curve, an optional AI scene designer and a local REST API sit on top. An optional Appliances tab reads LG washers, dryers and refrigerators through LG ThinQ."
related:
  - /robos-tv/
  - /audio-player/
  - /home-speaker/
  - /dev-central/
  - /robos-dashboards/
permalink: /smart-home/
---

RobOS Smart Home (`packages/smart-home`), previously Smart Light, is an Electron window over the shared engine `robos-lib/smart-light-engine.js`. The engine builds each vendor's local packet from a light's on/off, brightness, color temperature and RGB color, sends it over UDP, TCP or HTTP, and saves the state. Lighting never goes through a vendor cloud. The one exception in the app is the optional [Appliances tab](#lg-appliances), which reads LG appliances through LG's cloud once you connect it.

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

Nothing in RobOS sets these states on its own. The app does not poll CI. A script or agent can set them through the local API (below). The **Open Dev Central** button only launches [Dev Central]({{ '/dev-central/' | relative_url }}).

The other cross-app buttons work the same way. **Activate TV Bias** applies the Cinema scene to the living room, and the rest launch [Smart TV Studio]({{ '/robos-tv/' | relative_url }}), [Audio Player]({{ '/audio-player/' | relative_url }}) or [Home Speaker]({{ '/home-speaker/' | relative_url }}). No lighting sync with those apps is implemented.

## LG appliances

The **Appliances** tab shows the LG washers, dryers and refrigerators on your LG ThinQ account. It only reads status: nothing in RobOS can start a cycle or change a setting.

| Appliance | What the card shows |
|---|---|
| Washer or dryer | Current state, time left, cycle length, delayed start or finish, whether remote start is on, cycles run and detergent setting |
| WashTower | The same details for the washer and the dryer, on one card |
| Refrigerator | Door open or closed, the temperature each compartment is set to, water and fresh air filter status, and express, quick freeze, eco, power saving and Sabbath modes |

Other LG appliances on the account appear with the plain values LG reports for them. Which details appear depends on what your model sends. Refrigerator temperatures are the settings, because LG's API does not report a measured temperature. The washer and dryer connection has been checked against a real LG account. The refrigerator and WashTower cards have only been tested with simulated LG responses so far.

### Connect your account

LG appliances are only reachable through LG's cloud, so unlike your lights this needs an internet connection and sends a token to LG.

1. Open the **Appliances** tab and click **Open LG's token page**, then sign in with your ThinQ account.
2. Add a token with the **view devices and statuses** permission and copy it.
3. Paste it into the app, check the two-letter country of your ThinQ account (it defaults to `US`) and click **Connect**.

The app tries the token before saving it. If LG rejects it, nothing is stored and the tab shows why. **Forget token** deletes the saved token from this computer; to cancel it completely, delete it on LG's token page too.

### How it behaves

The app calls LG's ThinQ Connect API directly from `robos-lib/lg-thinq.js`: `GET /devices`, then `GET /devices/<id>/state` for each appliance, one at a time. It checks when you open the tab and once a minute while the tab is showing, and it does not use LG's live event stream, so a change can take up to a minute to appear. Nothing is checked while the tab is hidden or the app is closed, and there are no notifications yet.

An appliance LG cannot reach is marked **Offline** and the others still show. If LG says the account has made too many requests, the app waits five minutes and keeps showing the last status it read.

The token is stored in `~/.config/robos/lg-thinq.json`, readable only by your user and not encrypted. Config Sync and shared bundles leave it out. The token and appliance status are not available through the local API below, which any web page on this computer could call.

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
- `~/.config/robos/lg-thinq.json`: your LG ThinQ token, country and a random client ID. Only present after you connect, and never synced. Appliance status is kept in memory only.
- `~/.config/robos/electron/smart-home/`: the Electron profile.

`ROBOS_CONFIG_DIR` moves all of them. With `ROBOS_TEST=1` the engine sends nothing on the network and the app does not contact LG.

The **Smart Lights** widget in [RobOS Dashboards]({{ '/robos-dashboards/' | relative_url }}) reads the lights file: how many lights are on out of the total, the active scene and the first few lights. If Smart Light has never saved its state, the widget shows no lights.

## Run it

Open **RobOS Smart Home** from the desktop or the [App Launcher]({{ '/app-launcher/' | relative_url }}). From the repository, run `scripts/dev-launch.sh smart-home`. When the RobOS library is installed, the window runs a DOM-snapshot debug server on port `19209`.

Source: [`packages/smart-home`](https://github.com/nddipiazza/robos/tree/main/packages/smart-home) and [`packages/robos-lib/smart-light-engine.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/smart-light-engine.js). The engine tests are in `smart-light-engine.test.cjs` next to it, the pairing, schedule and dashboard-widget tests are in `packages/robos-test/tests/smart-home/unit.test.js`, and the LG tests are in `packages/robos-test/tests/smart-home/lg-thinq.test.js`. The LG client is [`packages/robos-lib/lg-thinq.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/lg-thinq.js).
