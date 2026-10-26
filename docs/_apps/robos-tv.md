---
title: "RobOS Smart TV Studio"
package: robos-tv
category: "core-desktop"
icon: robos-tv.svg
summary: "Pair Smart TVs, build & sideload Developer Mode TV apps (LG webOS, Samsung Tizen, Google TV/ADB, Roku), serve the 10-foot D-Pad TV Portal (:19210), and stream 4K games."
description: "First-class Smart TV integration for RobOS: Developer Mode native app generator and sideloader (LG webOS IPK, Samsung Tizen WGT, Google TV/Android TV ADB Leanback, Roku OS), automated LG 1,000-hour dev timer renewal, 10-foot D-Pad/Gamepad Big-Screen Portal, and Moonlight/Sunshine 4K 120Hz game streaming."
related:
  - /tv/
  - /apps/home-speaker/
  - /apps/audio-player/
  - /apps/game-playthrough/
---

**RobOS Smart TV Studio** (`packages/robos-tv`) makes living-room and office wall Smart TVs first-class citizens of RobOS. Because commercial TV app stores restrict full Linux/Electron suites, **RobOS Smart TV Studio** bridges your workstation or appliance VM to any Smart TV on your local network through **Developer Mode sideloading**, a **10-Foot Big-Screen Spatial Navigation Portal (`:19210`)**, **Zero-Cloud Google Cast**, and **Moonlight / Sunshine 4K 120Hz streaming**.

![RobOS Smart TV Architecture]({{ '/assets/images/tv/robos-tv-architecture.png' | relative_url }})

## Supported Smart TV Platforms & Developer Mode Sideloading

1. **Google TV / Android TV / Amazon Fire TV (`adb` + Google Cast)**:
   - Generates an Android TV Leanback launcher project (`AndroidManifest.xml`, `assets/index.html`, and `sideload-android-tv.sh`).
   - Connects over wireless ADB (`<TV-IP>:5555`) to install the launcher onto the TV home row or immediately open the 10-Foot Portal URL (`am start -a android.intent.action.VIEW -d http://<HOST-IP>:19210`).
2. **LG webOS Smart TVs (`ares-package` / `ares-install` / `ares-extend-dev`)**:
   - Generates a complete webOS `.ipk` project (`appinfo.json`, `index.html`, and `sideload-webos.sh`).
   - Fetches the SSH developer key from the LG Key Server (`:9991`), installs `com.robos.tv`, and includes one-click + background **Auto-Renewal of LG's 1,000-hour Developer Mode timer** (`ares-extend-dev`).
3. **Samsung Tizen Smart TVs (`tizen` / `sdb`)**:
   - Generates a Tizen Web Widget project (`config.xml` with `tv.inputdevice` remote key privileges, `index.html`, and `sideload-tizen.sh`) and deploys `RobOSTV.wgt` over Smart Development Bridge (`:26101`).
4. **Roku OS TVs & Players (`ECP :8060` + SceneGraph `.zip`)**:
   - Generates a Roku SceneGraph channel bundle (`manifest`, `source/Main.brs`, `components/MainScene.xml`, and `sideload-roku.sh`) and controls the TV with zero-auth Roku External Control Protocol (`http://<TV-IP>:8060/keypress/*`).
5. **Moonlight / Sunshine 4K 120Hz Full Desktop & Godot 4 Game Streaming**:
   - Pairs with the native Moonlight client on any Smart TV or Apple TV to stream the full RobOS desktop and Godot 4 games (`Realm of Heroes cRPG`, `Quest: Warrior Dragon`, `Tabletop RPG`, `Starfall Command RTS`) with full Bluetooth gamepad support.

## The 10-Foot Big-Screen Portal (`:19210`)

When you launch the sideloaded **RobOS TV** app from your TV's native app bar, it opens the live **RobOS 10-Foot Portal** (`http://<HOST-IP>:19210`) designed specifically for viewing from 10 feet away:

- **Full TV Remote D-Pad & Gamepad Spatial Navigation**: Navigate the 4×2 tile grid using your TV remote's directional pad (`Up`, `Down`, `Left`, `Right`, `OK/Enter`, `Back`) or any connected controller via the HTML5 Gamepad API.
- **8 Big-Screen Experiences**:
  1. **RobOS 10-Foot Home** — Active agents, sprint status, and system health.
  2. **Realm of Heroes cRPG** — Party-based tactical D&D 5e cRPG in Godot 4.
  3. **Quest: Warrior Dragon** — NES-authentic 2D JRPG playable with a TV remote D-Pad.
  4. **RobOS Tabletop RPG** — 26×19 living-room dungeon board for tabletop game nights.
  5. **Audio Player & Virtual DJ** — 100,000-song jukebox with full-screen lyrics and Kokoro Virtual DJ intros.
  6. **Home Speaker Intercom** — Multi-room walkie-talkie and neural TTS announcements.
  7. **PR Review Theater** — Watch narrated 1080p agent proof-of-work walkthrough videos from the couch.
  8. **POS Order & Prep Display** — Turn any wall-mounted TV into a café/bar order prep board or menu display.

## Run it

Launch **RobOS Smart TV Studio** from the App Launcher, click **📺 Smart TV Studio** inside [RobOS Home Speaker]({{ '/apps/home-speaker/' | relative_url }}), or run:

```bash
electron packages/robos-tv
```
