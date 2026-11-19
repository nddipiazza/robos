---
title: "RobOS IP Camera for Android"
package: ip-camera-android
category: household
icon: camera-watch.svg
summary: "Prototype RobOS Mobile app that turns an Android 11+ phone into an always-on local Wi-Fi surveillance camera with ONVIF WS-Discovery, MJPEG streaming, motion alarms, solid-state PTZ, and screen-off foreground operation for Camera Watch and Smart Home."
description: "RobOS IP Camera for Android turns a spare or dedicated Android 11+ phone into a 24/7 local Wi-Fi ONVIF surveillance camera for RobOS Camera Watch and Smart Home."
permalink: /ip-camera-android/
redirect_from:
  - /apps/ip-camera-android/
landing: /mobile/
---

RobOS IP Camera for Android is part of [RobOS Mobile](/mobile/). It turns an Android 11+ phone—either sideloaded over USB or running the prototype LineageOS 24 OS image—into an always-on local Wi-Fi surveillance camera that [Camera Watch](/camera-watcher/) and [Smart Home for Android](/smart-home-android/) find automatically on your home network.

## What it does

- **Stays connected like a hardware IP camera:** Captures Camera2 frames inside an Android `foregroundServiceType="camera"` foreground service on its own thread with no Activity surface dependency, holding CPU, low-latency Wi-Fi and multicast locks. Turning the phone's screen off with the Power button, locking the phone, or using the built-in **OLED Blackout** wall-mount screen never interrupts the stream.
- **Zero-configuration ONVIF discovery:** Answers WS-Discovery probes on `239.255.255.250:3702`, so clicking **Find cameras** in [Camera Watch](/camera-watcher/) or **Find cameras** in [Smart Home for Android](/smart-home-android/) finds the phone immediately on Wi-Fi.
- **Live streams, snapshots & browser view:** Serves main (`/video`) and sub (`/sub`) multipart MJPEG streams, instant stills (`/snapshot.jpg`), ONVIF Profile S/T SOAP (`/onvif/device_service`), and a dark-theme browser viewer (`http://<phone-ip>:8080/`).
- **Solid-state PTZ & presets:** Zoom (`1x`–`8x`) and pan/tilt crop across the phone's camera sensor directly from Camera Watch's PTZ pad, plus presets for `1x Wide`, `2x Zoom`, `4x Zoom`, `Front Camera`, and `Toggle Flashlight`.
- **On-camera motion & automatic recovery:** Runs local grayscale luma motion detection with ONVIF pull-point motion events, self-heals stalled camera sessions, rebinds across Wi-Fi reconnects, and resumes after power outages.

## Privacy

Video stays on your local network and is never uploaded to any cloud service. Optional HTTP Basic and OASIS WS-Security PasswordDigest credentials are encrypted with an Android Keystore key.

## Build, install and test

The app lives in [`packages/ip-camera-android`](https://github.com/nddipiazza/robos/tree/main/packages/ip-camera-android) and runs on Android 11 (API 30) or later:

```bash
cd packages/ip-camera-android
./gradlew testDebugUnitTest
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
