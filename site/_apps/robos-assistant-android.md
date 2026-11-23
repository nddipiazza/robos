---
title: "RobOS Assistant for Android"
package: robos-assistant-android
category: household
icon: voice-prompt.svg
summary: "Prototype RobOS Mobile app that turns an Android 11+ phone into an always-on 24/7 audio + offline text surveillance recorder and room voice assistant that executes RobOS actions only when connected to a RobOS Voice Server (:19188)."
description: "RobOS Assistant for Android listens 24/7 like a surveillance camera, saving .wav audio and offline Vosk transcripts locally, and runs RobOS Voice commands when connected to a RobOS Server."
permalink: /robos-assistant-android/
redirect_from:
  - /apps/robos-assistant-android/
landing: /mobile/
---

RobOS Assistant for Android is part of [RobOS Mobile](/mobile/). Modeled on [RobOS Voice](/voice-prompt/) and the always-on foreground architecture of [RobOS IP Camera for Android](/ip-camera-android/), it turns an Android 11+ phone—including the LineageOS 24 prototype OS image with no Google Play Services—into a 24/7 room microphone surveillance recorder and voice assistant.

## What it does

- **Listens and records 24/7 like a surveillance camera:** Captures 16 kHz mono audio inside an Android `foregroundServiceType="microphone"` foreground service holding CPU and low-latency Wi-Fi locks. Turning the screen off with the Power button, locking the phone, or activating **OLED Blackout** wall-mount mode never interrupts listening.
- **Saves both `.wav` audio and offline text:** Uses an adaptive voice activity detector (VAD) with a 500 ms circular pre-roll buffer and open-source on-device **Vosk** speech recognition (`vosk-model-small-en-us-0.15`, Apache 2.0) so every spoken utterance is archived locally as both a playable `.wav` clip and searchable text—with automatic MB and clip-count retention limits.
- **RobOS Server required for actions:**
  - **When no RobOS Server is connected:** The phone operates strictly as a local audio + text surveillance recorder (`Recorder Mode Only`), using offline Vosk STT on the phone. Even if someone says `"Commander…"`, no actions run; the utterance is recorded locally as `.wav` audio + text.
  - **When a RobOS Voice Server (`:19188`) is connected:** Auto-discovered on Wi-Fi or paired by IP, captured `.wav` utterances are processed on the RobOS Server by OpenAI Whisper (`whisper-base.en`), `"Commander"` commands and **Ask RobOS** prompts execute skills on the RobOS Server, record the action outcome alongside the `.wav` clip, and speak the natural neural TTS reply on the phone speaker with acoustic echo suppression.
- **Built-in LAN Web Console & Live Audio Stream (`:8090`):** Serves a dark-theme browser console (`/`), live continuous WAV monitoring (`/audio.wav`), live SSE transcripts (`/api/stream`), and byte-range `.wav` playback (`/recordings/<id>.wav`), protected by optional Android Keystore-encrypted HTTP Basic auth.

## Build, install and test

```bash
cd packages/robos-assistant-android
./gradlew testDebugUnitTest
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
