---
title: "RobOS Home Speaker"
package: home-speaker
category: core-desktop
icon: home-speaker.svg
summary: "Smart speaker intercom, walkie-talkie voice notes, neural TTS broadcast, custom audio streaming, and soundboard."
description: "Desktop intercom and broadcast controller for Google Home, Nest, and Cast speakers: push-to-talk voice recording, Kokoro neural speech synthesis, custom audio streaming, soundboard effects, and ambient focus generator."
---

RobOS Home Speaker turns your workstation into a multi-room smart speaker intercom and broadcast audio hub, bridging developer workflows and home automation directly to Google Home and Nest smart speakers on the local network without cloud dependencies.

## Features

- **Push-to-Talk Voice Walkie-Talkie**: Record voice notes directly in the desktop app with an animated live oscilloscope waveform and broadcast them instantly to any smart speaker with an optional attention chime.
- **Neural Text-to-Speech Intercom**: Broadcast typed announcements in ultra-natural offline voices (Kokoro-82M and Piper neural models) with custom speech rates, attention chimes, and pre-canned developer presets (Build Succeeded, CI Failed, Dinner's Ready, Coffee Brewed).
- **Custom Audio File Streaming**: Drag-and-drop or browse any local audio file (MP3, WAV, FLAC, OGG, AAC) to stream immediately to physical Google Home/Nest speakers.
- **Instant Soundboard**: One-click audio effects (Intercom Chime, Attention Ping, Victory Fanfare, Alert Siren, Witch Laugh) sent to speakers.
- **Ambient Focus & Sleep Timer**: Procedural soundscapes (Rain, Fireplace, Deep Brown Noise, Cyber Drone) streamed to smart speakers with an automated sleep timer (15m to 2h).
- **Multi-Room & Broadcast All**: Target an individual speaker (such as the Kitchen Speaker) or broadcast concurrently across every speaker in the home or office.
- **SDLC Agent CLI Bridge (`robos-speaker`)**: Trigger voice announcements, alerts, or sound effects programmatically from CI scripts, git hooks, or autonomous AI agents.
- **DOM Snapshot Debugging**: Exposes automated inspection and event testing over port `19200`.

## Supported Hardware

- Google Nest Audio & Google Home
- Google Nest Mini
- Lenovo / Google Smart Clocks
- Chromecast Audio and Cast-enabled smart displays

## Files & Ports

- App directory: `packages/home-speaker/`
- CLI tool: `packages/robos-cli/robos-speaker`
- Snapshot debug port: `19200`
- Config cache: `~/.config/robos/home-speakers.json`
