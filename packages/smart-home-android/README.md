# RobOS Smart Home for Android

A native Kotlin and Jetpack Compose app that controls smart lights directly over Wi-Fi. It needs no RobOS computer, no vendor account and no cloud. The Appliances tab is the one exception: LG appliances can only be reached through LG's cloud.

It is a port of the desktop app in `packages/smart-home` and its engine in `packages/robos-lib/smart-light-engine.js`.

| Tab | What it does |
|---|---|
| Lights | Scan Wi-Fi, pair a Hue Bridge or add a light by IP. Then set power, brightness, white temperature, color and WLED effects, by room. |
| Scenes | Apply the built-in scenes to one room or the whole home, match the time of day, or save your lights as a scene. |
| Schedules | Apply a scene at a set time, with an optional fade, while the app is closed. |
| Appliances | Read-only status of LG washers, dryers and refrigerators. The token is encrypted with the Android Keystore. |

Supported lights: Philips WiZ, Philips Hue Bridge, WLED, TP-Link Kasa, LIFX, Govee, Elgato Key Light, Yeelight, Shelly RGBW and Home Assistant.

## Build and install

You need JDK 17 and the Android SDK with `platforms;android-37.0`. Put `sdk.dir=/path/to/Sdk` in `local.properties`, or set `ANDROID_HOME`.

```bash
./gradlew assembleDebug
```

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The app runs on Android 11 and later. The phone needs USB debugging, not an unlocked bootloader.

## Test

```bash
./gradlew testDebugUnitTest
```

```bash
tools/e2e.sh
```

- **Unit tests** run the engine on the JVM with real loopback sockets. `GoldenTest` compares it with what the desktop JavaScript produces, and lists each place the phone differs on purpose. After changing the desktop engine, run `node tools/export-golden.js`.
- **`tools/e2e.sh`** drives the real app on an emulator against `tools/fake-lights.js`, which records what each fake light receives. Screenshots go to `evidence/`.

## Differences from the desktop app

- A new phone starts with no lights and no schedules, rather than demo lights and a nightly auto-off.
- Adding or scanning for a light never changes that light.
- A light that does not answer shows why. Govee and Yeelight cannot confirm a command, so those show as sent.
- Pairing a Hue Bridge adds every light on it.
- Protocol fixes the desktop does not have yet: LIFX and Yeelight power on before setting color, WiZ and Hue send only the off state when turning off, and Home Assistant uses `color_temp_kelvin`.
- Left out: the AI scene designer, CI status light, cross-app bridges and protocol inspector.

## Known gaps

- Nothing here has been tested on real lights or a real Moto G10 yet. WiZ and Hue should be checked first.
- Scan broadcasts and mDNS have not been tested on a real network; the emulator cannot carry them.
- Schedules are not verified to survive a reboot, or to run during deep sleep.
- The app remembers what it last sent, and does not read back changes made with a wall switch or another app.
- Hue usernames and Home Assistant tokens are saved in the app's private storage without extra encryption.
