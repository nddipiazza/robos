---
title: "RobOS Voice"
package: voice-prompt
category: ai-agents
icon: voice-prompt.svg
summary: "Speech-to-text dictation and spoken replies for the desktop, with a local HTTP API on port 19188."
description: "Transcribes speech on the machine with a Whisper model and speaks text with Kokoro, Edge-TTS, Piper or Speech Dispatcher. Hands-free wake-word activation is not connected yet."
related:
  - /voice-prompt.html
---

RobOS Voice turns speech into text and speaks text aloud. A third job, answering short questions by voice, is only partly built. This page is the app summary. Setup, the API and the command-line client are covered in [RobOS Voice]({{ site.baseurl }}{% link voice-prompt.md %}).

## The window

The tabs are **Dictation & Context**, **Outgoing Voice (Natural TTS)** and **RobOS Desktop Assistant**.

- **Dictation & Context.** **Activate Microphone** starts recording. Recognized text streams into the panel, and **Save Voice Prompt** stores it. A context panel shows the focused app, window title, running apps and the active workspace and branch. The default push-to-talk hotkey is `Super+V`, set by `pushToTalkKey` in the voice preferences.
- **Outgoing Voice.** Choose the engine (Kokoro-82M, Edge-TTS, Piper or Speech Dispatcher), a voice, speed, pitch and volume, and preview with **Speak Out Loud**. "RobOS" is spoken as "Row Bose".
- **RobOS Desktop Assistant.** The code can detect phrases such as "hello robos" or "row bose" followed by a question and send the question, with the active window and workspace as context, to the AI agent library. Nothing in the app passes the live speech stream to that code, so hands-free activation does not work yet. If no AI provider answers, the assistant returns a generic acknowledgement and does not answer the question. See [RobOS Voice]({{ site.baseurl }}{% link voice-prompt.md %}).

A floating HUD window shows speech bubbles and command results, and a commands dialog lists the spoken commands that map to RobOS apps and skills.

## What it needs

| Part | Requirement |
|---|---|
| Speech-to-text | `@xenova/transformers` with the `Xenova/whisper-tiny.en` model, run on the machine. A microphone, captured with `pw-record` (PipeWire) or `arecord` (ALSA). |
| Kokoro voices | The model file `~/.local/share/kokoro/kokoro-v1.0.onnx` and `python3`. |
| Edge-TTS voices | The `edge-tts` command, which calls an online Microsoft service. |
| Piper voices | A `piper` binary and voices in `~/.local/share/piper/voices`. |
| Assistant answers | An AI provider configured for `robos-lib/ai-agent`. |

## Files and ports

- Saved prompts: `~/.config/robos/voice-prompts.json`.
- HTTP API: `http://localhost:19188` (change it with `ROBOS_VOICE_PORT`). Routes include `/api/status`, `/api/stream` (server-sent events), `/api/activate`, `/api/deactivate`, `/api/dictate`, `/api/context`, `/api/prompts`, `/api/speak` and `/api/assistant/chat`.
- Command line: `packages/voice-prompt/bin/robos-voice-prompt`, and the `robos-voice` script in `packages/robos-cli`.

## Run it

Launch **RobOS Voice** from the app launcher, or run `npm start` in `packages/voice-prompt`. Set `ROBOS_TEST=1` to start it without microphone hardware.
