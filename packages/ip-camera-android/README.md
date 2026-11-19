# RobOS IP Camera for Android

Turns an Android 11+ phone (including the LineageOS 24 RobOS phone image in `infra/android`) into an always-on local Wi-Fi surveillance camera for **RobOS Camera Watch** (`packages/camera-watch`) and **RobOS Smart Home** (`packages/smart-home-android`, `packages/smart-home`). No vendor account, no cloud relay, and no subscription.

| Tab | What it does |
|---|---|
| **Live** | Live viewfinder, stream on/pause switch, back/front lens toggle, `1x` / `2x` / `4x` hardware sensor zoom, LED flashlight toggle, copyable ONVIF & MJPEG URLs, 24/7 power/thermal telemetry, unrestricted battery setup, and **OLED Blackout** wall-mount mode. |
| **Camera** | Camera name & Smart Home room, lens, resolution (`1080p`, `720p HD`, `480p`, `360p`), frame rate (`5–30 fps`), upright orientation (`Auto` gravity sensor or fixed mount), OSD timestamp watermark, and on-camera luma motion detection with ONVIF motion alarms. |
| **Network** | HTTP / ONVIF port (`8080`), ONVIF WS-Discovery multicast responder (`239.255.255.250:3702`), optional Keystore-encrypted HTTP Basic + WS-Security PasswordDigest authentication, auto-start on boot, and keep-awake controls. |

## Built to stay running 24/7

- **Off-screen Camera2 pipeline (`Camera2Engine` + `CameraServerService`)**: Captures `YUV_420_888` frames on a dedicated `HandlerThread` inside a `foregroundServiceType="camera"` foreground service with no Activity surface dependency. Turning the phone's screen completely off with the physical Power button, locking the phone, or switching apps never interrupts the stream.
- **CPU, Low-Latency Wi-Fi & Multicast Locks**: Holds a `PARTIAL_WAKE_LOCK`, `WIFI_MODE_FULL_LOW_LATENCY` lock, and `MulticastLock` while streaming so Wi-Fi power-save never drops frames or misses ONVIF discovery scans.
- **Self-healing watchdog & boot recovery**: Automatically restarts the Camera2 session if the HAL stalls or disconnects, rebinds ONVIF WS-Discovery across Wi-Fi reconnects or DHCP renewals, and resumes after power outages via `BootReceiver`.
- **Zero-cloud ONVIF + MJPEG endpoints**:
  - `UDP 239.255.255.250:3702` — ONVIF WS-Discovery responder (`Find cameras` in Camera Watch)
  - `POST /onvif/device_service`, `/onvif/media`, `/onvif/ptz`, `/onvif/events` — ONVIF Profile S/T SOAP (streams, snapshots, solid-state sensor PTZ pan/tilt/zoom, presets `1..5`, pull-point motion events)
  - `GET /video` & `GET /sub` — Multipart MJPEG main and sub streams
  - `GET /snapshot.jpg` — Instant JPEG still frame
  - `GET /` — Built-in dark-theme RobOS browser viewer

## Build, test and install

```bash
cd packages/ip-camera-android
./gradlew testDebugUnitTest
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

For a phone running the LineageOS `infra/android` image, sign with the image's `testkey` before installing so all `com.robos.*` apps share `com.robos.permission.MANAGE_SETTINGS`.
