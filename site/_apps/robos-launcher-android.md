---
title: "RobOS Home for Android"
package: robos-launcher-android
category: core-desktop
icon: app-launcher.svg
summary: "Prototype RobOS Mobile home screen for Android: shows the time, the date and every app, with RobOS apps first."
description: "RobOS Home for Android is a prototype launcher in RobOS Mobile. It runs on any Android 11+ phone or as the home screen in the prototype LineageOS 24 OS image."
permalink: /robos-launcher-android/
redirect_from:
  - /apps/robos-launcher-android/
landing: /mobile/
---

RobOS Home is the prototype launcher in [RobOS Mobile](/mobile/). You can install it as an optional home screen on any Android 11+ phone, and it also replaces the stock Android launcher in the prototype LineageOS 24 OS image.

## What you see

- The time and date at the top.
- Every app on the phone that can be opened, RobOS apps first, then the rest. On the prototype OS image that includes Smart Home, Preferences, Files, Music, Settings and the AudioFX equalizer.
- Apps you add later with `adb install`, such as Firefox from Mozilla's official downloads, appear here too.

Tap an app to open it. On the prototype OS image where RobOS Home replaces the stock launcher, there is no Recents app switcher because Android's switcher lived inside the stock launcher.

## Run it on any Android phone

RobOS Home runs right now as an ordinary APK prototype on any phone with Android 11 (API 30) or later—no unlocked bootloader needed. Build it, install it over USB, and choose RobOS Home as the home app in Settings whenever you want to try it:

```bash
cd packages/robos-launcher-android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Source

The app lives in [`packages/robos-launcher-android`](https://github.com/nddipiazza/robos/tree/main/packages/robos-launcher-android). The optional full OS image that bundles it is built by `infra/android/robos-image.sh`; see the [RobOS Mobile guide](/mobile/) and [how we built the LineageOS 24 prototype](/blog/robos-phone-lineageos-moto-g100/).
