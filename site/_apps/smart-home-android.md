---
title: "RobOS Smart Home for Android"
package: smart-home-android
category: household
icon: smart-home.svg
summary: "Prototype RobOS Mobile app that controls Wi-Fi lights straight from any Android 11+ phone with no RobOS computer needed: Feit/Smart Life, WiZ, Hue, WLED, Kasa, LIFX, Govee, Elgato, Yeelight, Shelly and Home Assistant."
description: "RobOS Smart Home for Android is a RobOS Mobile prototype that controls smart lights directly over Wi-Fi on any Android 11+ phone and restores lights from RobOS Config Sync."
permalink: /smart-home-android/
redirect_from:
  - /apps/smart-home-android/
landing: /mobile/
---

RobOS Smart Home for Android is the mobile prototype of [Smart Home](/smart-home/), part of [RobOS Mobile](/mobile/). It talks to your lights directly on your home Wi-Fi, so it works without a RobOS computer switched on. You can build and sideload it right now onto any Android 11+ phone with `adb install` (no unlocked bootloader or device wipe needed), and it is also built into the prototype LineageOS 24 OS image.

## What it does

- **Lights:** switch, dim and color lights, together or one at a time. **Scan** finds WiZ, WLED, Kasa, LIFX, Govee, Elgato, Yeelight and Shelly lights on your network. **Pair Hue Bridge** pairs a Philips Hue bridge with its button. Home Assistant uses a long-lived access token.
- **Feit Electric and Smart Life (Tuya) lights:** tap **Add Feit or Smart Life lights** and follow the steps. You create a free Tuya cloud project once (about 20 minutes), enter its Access ID and Access Secret, and the app fetches each light's key. After that it controls the lights locally.
- **Rooms and scenes:** group lights by room and save scenes.
- **Schedules:** turn lights on or off, or fade them, at set times. Schedules run while the app is closed.
- **Appliances:** LG ThinQ appliance status, read only.

## Bring your lights from a RobOS computer

[RobOS Preferences for Android](/robos-preferences-android/) restores the lights, rooms, scenes and schedules from your RobOS computer's [Config Sync](/config-management/) backup when both apps are signed with the same key. Tuya keys are never synced: each device fetches its own, so enter your Tuya project keys once on the phone.

## Privacy

Light keys are stored in a file encrypted with a key from the Android Keystore. Commands go from the phone to the light on your network, not through a cloud service.

## Build, install and test

The app lives in [`packages/smart-home-android`](https://github.com/nddipiazza/robos/tree/main/packages/smart-home-android) and runs on Android 11 (API 30) or later. Its tests include `GoldenTest`, which checks the phone's light protocols byte for byte against the desktop app:

```bash
cd packages/smart-home-android
./gradlew test
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
