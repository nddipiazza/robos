---
title: "RobOS Personality"
package: personality
category: "ai-agents"
component_type: app
permalink: /personality/
summary: "Talk to an AI personality with a face, a voice, ears and eyes"
description: "Talk to an AI personality with a face, a voice, ears and eyes: an animated face in a window or on a TV, spoken answers with captions, a microphone, and a Camera Watch camera."
icon: personality.svg
---

# RobOS Personality

**RobOS Personality** (`packages/personality`) gives an AI a body you can talk to. You type or speak, an AI agent answers in character, and an animated face says the answer out loud with captions. It can also look through one of your cameras.

## The parts of a personality

A personality is built from five parts. Each has its own card on the left of the app.

| Part | What it is | Where it comes from |
|---|---|---|
| **Face** | A name, a short description of who it is, and an animated face (a robot screen or a cartoon buddy) in your choice of color. The mouth moves with the voice, the eyes blink and glance around, and they look up while it thinks. | Drawn by the app. Shown in the app, in its own window on any monitor (F11 for full screen), or cast to a TV. |
| **Voice** | The speech engine, the voice, the speed, and which speaker plays it. Captions of each line appear under the face, word by word. | [RobOS Voice]({{ '/voice-prompt/' | relative_url }})'s engines: Kokoro (natural, offline), Piper (fast, offline) or Edge TTS (online). |
| **Ears** | The microphone. While it hears you, your words appear on the face. When you stop talking, it answers. | Speech recognition by RobOS Voice's Whisper, on this computer. |
| **Eyes** | One camera. The face shows a small picture of what it sees, and the AI gets the latest picture with every question. | A camera you added in [RobOS Camera Watch]({{ '/camera-watch/' | relative_url }}): an IP camera, an RTSP or MJPEG address, or a webcam. |
| **Model** | The AI agent that thinks for it. | The shared agent picker: Codex, AGY (Antigravity), Claude Code or GitHub Copilot, whichever you have signed in to. |

## Talking to it

1. Open **RobOS Personality**. It starts with **Robo**, a friendly robot.
2. Under **Model**, pick an AI agent you are signed in to.
3. Type in the box at the bottom and press **Send**, or press **Listen** and talk. Press **Stop listening** when you are done.
4. The face shows **thinking**, then speaks the answer. The conversation is kept on the right and saved for next time; **Clear** starts over.

It does not listen while it is talking or thinking, so it never answers itself.

To try a camera, add one in Camera Watch first, then pick it under **Eyes** and ask "What do you see?". Agents that can open pictures (AGY and Claude Code do) describe what is in front of the camera.

## Showing the face somewhere else

- **Show in a window** opens the face in its own window. Choose the monitor first; tick **Full screen** to fill it.
- **Cast to TV** sends the face to a TV paired in [RobOS Smart TV Studio]({{ '/robos-tv/' | relative_url }}). Browser TVs (LG webOS, Samsung Tizen, Google TV) open the face page; Roku TVs show live frames through the RobOS TV channel. The voice keeps playing on the speaker picked under **Voice**.

The face page is only shared with other machines while a TV cast is on, and every request needs a key made when the app starts.

## Several personalities

Use **New** to make another personality, each with its own face, voice, devices, camera, agent and conversation. Switch between them with the picker at the top.

## Where things live

- Personalities: `~/.config/robos/personality/personalities.json`; conversations: `~/.config/robos/personality/history/<id>.json`.
- Face display server: `:19223` (`/face`, `/events`, `/sight.jpg`). DOM snapshot debug port: `19222`.
- Tests: `packages/robos-test/tests/personality/` (unit tests, and an end-to-end test that talks to the app with a stand-in model).

## Source and integration

The component lives in [`packages/personality`](https://github.com/nddipiazza/robos/tree/main/packages/personality).

Its entry point is [`main.js`](https://github.com/nddipiazza/robos/tree/main/packages/personality/main.js).

## Run from source

From `packages/personality`, install the dependencies and run:

```bash
npm install
npm start
```
