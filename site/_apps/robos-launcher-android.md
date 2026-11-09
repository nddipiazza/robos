---
title: "RobOS Home for Android"
package: robos-launcher-android
category: core-desktop
icon: app-launcher.svg
summary: "The home screen of the RobOS phone: the time, the date and every app, with the RobOS apps first."
description: "RobOS Home for Android is the launcher built into the RobOS phone image. It shows the time, the date and every launchable app, RobOS apps first."
permalink: /robos-launcher-android/
redirect_from:
  - /apps/robos-launcher-android/
landing: /phone/
---

RobOS Home is the first screen you see on the [RobOS phone](/phone/). It replaces the stock Android launcher in the phone image.

## What you see

- The time and date at the top.
- Every app on the phone that can be opened, RobOS apps first, then the rest. On the image that includes Smart Home, Files, Music, Settings and the AudioFX equalizer.
- Apps you add later with `adb install`, such as Firefox from Mozilla's official downloads, appear here too.

Tap an app to open it. There is no app switcher: it belonged to the stock launcher, so the Recents button does nothing.

## Try it on another phone

RobOS Home also runs as an ordinary app on Android 11 or later. Build it, install it, then choose RobOS Home as the home app in Settings:

```bash
cd packages/robos-launcher-android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Source

The app lives in [`packages/robos-launcher-android`](https://github.com/nddipiazza/robos/tree/main/packages/robos-launcher-android). The phone image that includes it is built by `infra/android/robos-image.sh`; read [how we built the RobOS phone](/blog/robos-phone-lineageos-moto-g100/).
