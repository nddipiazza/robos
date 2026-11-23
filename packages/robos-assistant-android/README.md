# RobOS Assistant for Android

Turns an Android 11+ phone (including the LineageOS 24 RobOS phone image in `infra/android`) into an always-on 24/7 audio surveillance recorder + **RobOS Voice** room assistant (`packages/voice-prompt`). No Google Play Services, no vendor account, and no cloud relay.

| Tab | What it does |
|---|---|
| **Listen** | Live 16-bar microphone waveform & dBFS telemetry, RobOS Server connection gate banner (`Connected` vs `Recorder Mode Only`), streaming offline speech words, direct **Ask RobOS** prompt bar, latest captured `.wav` clip, unrestricted battery setup, and **OLED Blackout** wall-mount mode. |
| **Recordings** | Searchable, filterable chronological log of every spoken utterance recorded as **both** a playable `.wav` audio clip and offline transcribed text, with wake-word & server-action badges (`Action Executed`, `Server Offline — Recorded Only`, `Audio + Text Saved`). |
| **Assistant** | Assistant name & Smart Home room, `"Commander"` wake-word toggle, spoken Kokoro/Piper/Edge-TTS reply playback with acoustic echo suppression, server-side Whisper + offline Vosk speech model status, VAD sensitivity, silence hang-time, and automatic MB/clip storage retention. |
| **Server** | Connect or auto-discover a **RobOS Voice Server** (`:19188`) on Wi-Fi to arm server-side Whisper transcription and `"Commander"` voice actions, configure the phone's built-in LAN HTTP surveillance console (`:8090`), Keystore-encrypted HTTP Basic auth, and boot recovery. |

## Core Rule: Surveillance Always, Server Whisper + Actions When Connected

- **When no RobOS Server is connected (`Recorder Mode Only`)**: The phone listens continuously 24/7 inside a `foregroundServiceType="microphone"` foreground service holding CPU and low-latency Wi-Fi locks, transcribes speech completely offline on-device using open-source **Vosk** (`vosk-model-small-en-us-0.15`, Apache 2.0), and saves every utterance as **both `.wav` audio and text** like a surveillance camera—without executing any actions.
- **When a RobOS Server (`:19188`) is connected**: Utterance `.wav` clips are sent to the RobOS Voice Server (`POST /api/assistant/process-audio`) for high-accuracy **OpenAI Whisper** (`whisper-base.en`) transcription, `"Commander"` wake-word commands execute RobOS skills/commands, and natural neural TTS replies play on the phone speaker.

## Built-in LAN Endpoints (`:8090`)

- `GET /` — Dark-theme RobOS Assistant browser console & playable `.wav` archive
- `GET /audio.wav` — Live continuous 16 kHz mono WAV microphone stream
- `GET /api/stream` — Server-Sent Events (SSE) live speech & action stream
- `GET /api/status` & `GET /api/recordings` — JSON telemetry and transcript archive
- `GET /recordings/<id>.wav` — Byte-range streaming `.wav` clip playback
- `POST /api/ask`, `POST /api/speak`, `POST /api/server/connect`, `POST /api/server/disconnect`

## Build, test and install

```bash
cd packages/robos-assistant-android
./gradlew testDebugUnitTest
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

For a phone running the LineageOS `infra/android` image, sign with the image's `testkey` before installing so all `com.robos.*` apps share `com.robos.permission.MANAGE_SETTINGS`.
