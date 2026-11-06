---
title: "RobOS Smart Home for Android"
package: smart-home-android
category: household
icon: smart-home.svg
summary: "Controls Wi-Fi lights straight from an Android phone, no RobOS computer needed: Feit Electric and Smart Life, WiZ, Hue, WLED, Kasa, LIFX, Govee, Elgato, Yeelight, Shelly and Home Assistant."
description: "RobOS Smart Home for Android controls smart lights directly over Wi-Fi, with rooms, scenes and schedules, and restores lights from RobOS Config Sync."
permalink: /smart-home-android/
landing: /phone/
---

RobOS Smart Home for Android is the phone version of [Smart Home](/smart-home/). It talks to your lights directly on your home Wi-Fi, so it works without a RobOS computer switched on. It is built into the [RobOS phone](/phone/) and also installs on other Android phones.

## What it does

- **Lights:** switch, dim and color lights, together or one at a time. **Scan** finds WiZ, WLED, Kasa, LIFX, Govee, Elgato, Yeelight and Shelly lights on your network. **Pair Hue Bridge** pairs a Philips Hue bridge with its button. Home Assistant uses a long-lived access token.
- **Feit Electric and Smart Life (Tuya) lights:** tap **Add Feit or Smart Life lights** and follow the steps. You create a free Tuya cloud project once (about 20 minutes), enter its Access ID and Access Secret, and the app fetches each light's key. After that it controls the lights locally.
- **Rooms and scenes:** group lights by room and save scenes.
- **Schedules:** turn lights on or off, or fade them, at set times. Schedules run while the app is closed.
- **Appliances:** LG ThinQ appliance status, read only.

## Bring your lights from a RobOS computer

[RobOS Preferences for Android](/robos-preferences-android/) restores the lights, rooms, scenes and schedules from your RobOS computer's [Config Sync](/config-management/) backup. Tuya keys are never synced: each device fetches its own, so enter your Tuya project keys once on the phone.

## Privacy

Light keys are stored in a file encrypted with a key from the Android Keystore. Commands go from the phone to the light on your network, not through a cloud service.

## Source

The app lives in [`packages/smart-home-android`](https://github.com/nddipiazza/robos/tree/main/packages/smart-home-android). Its tests include `GoldenTest`, which checks the phone's light protocols byte for byte against the desktop app:

```bash
cd packages/smart-home-android
./gradlew test
```
