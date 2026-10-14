---
title: "RobOS Audio Player"
package: audio-player
category: core-desktop
icon: audio-player.svg
summary: "Open-source Howler.js audio player, procedural ambient sound synthesizer, and zero-cloud Google Home / Cast smart speaker streaming."
description: "Desktop audio playback with real-time spectrum visualization, local file queuing, procedural focus soundscapes, and local TLS Google Cast streaming to smart speakers."
---

RobOS Audio Player provides high-fidelity audio playback for the developer desktop and bridges sound output to physical Google Home and Nest smart speakers on the local network without cloud roundtrips.

## Features

- **Open-Source Howler.js Engine**: Reliable client-side audio playback supporting MP3, WAV, OGG, FLAC, and AAC files with Web Audio API bindings.
- **Dual-Mode Output Routing**:
  - **Desktop Output**: Streamlined playback directly on the developer workstation with an interactive real-time spectrum visualizer.
  - **Local Google Home / Cast Streaming**: Zero-cloud LAN streaming directly to physical smart speakers (`castv2` over port 8009 TLS) through an ephemeral local HTTP streamer.
- **Procedural Focus Synthesizers**: Real-time Web Audio soundscape generators (Coding Rain, Cyber Synth, Pink Noise, Zen Chimes) designed for deep work with zero external asset dependencies.
- **Smart Speaker Voice Announcer**: Instant TTS announcement broadcaster for team standups, build successes, PR review notifications, or custom messages.
- **DOM Snapshot Debugging**: Exposes automated inspection and event testing over port `19196`.

## Hardware & Network Discovery

The player uses mDNS and LAN probing on port 8008 (`eureka_info`) and port 8009 to automatically discover and control nearby Google Cast devices, including:
- Google Nest Audio & Google Home
- Google Nest Mini
- Lenovo / Google Smart Clocks
- Chromecast Audio and Cast-enabled smart displays

## Files & Ports

- App directory: `packages/audio-player/`
- Snapshot debug port: `19196`
- Ephemeral stream server: Dynamic port on host LAN interface
