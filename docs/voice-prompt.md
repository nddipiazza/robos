---
title: RobOS Voice
layout: default
parent: Use RobOS
nav_order: 2
permalink: /voice-prompt.html
---

# RobOS Voice
{: .no_toc }

RobOS Voice is a desktop app that transcribes your speech on the machine, runs spoken commands, speaks replies, and exposes a local HTTP API and a `robos-voice` command. This page covers what works today, what it needs, and how to drive it.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What it is

The package is [`packages/voice-prompt`](https://github.com/nddipiazza/robos/tree/main/packages/voice-prompt) (desktop entry name "RobOS Voice"; app page: [Voice Prompt]({{ '/apps/voice-prompt/' | relative_url }})). Starting it does three things:

- It opens a small always-on-top window (380 by 520 pixels, bottom-right by default) where recognized speech appears as text bubbles.
- It registers the push-to-talk hotkey `Super+V`.
- It starts an HTTP server on port `19188`. Set `ROBOS_VOICE_PORT` to use another port.

## Requirements and limits

- **Linux only.** The microphone is read with `pw-record` (PipeWire) or `arecord` (ALSA). Window context uses `xdotool` and `xprop`, so it needs an X11 session.
- **Speech recognition** uses the `Xenova/whisper-tiny.en` model through `@xenova/transformers`, so it is English only. `packages/voice-prompt/package.json` lists only `electron`, and nothing else in the repository installs `@xenova/transformers`. If the import fails, the engine logs a warning and every transcript is empty. Installing it with `npm install @xenova/transformers` inside the package should satisfy the import; this page does not verify that.
- **Speech output** needs at least one engine installed. See "Speech output" below.
- Not built yet: hands-free wake-word activation. See "Not built yet".

## Start it

```bash
scripts/dev-launch.sh voice-prompt
```

You can also start it from the desktop launcher entry "RobOS Voice" on an installed system. Only one instance runs; starting a second one quits.

## Dictate

1. Click **Start Recording** or press `Super+V`. Both toggle the microphone. The key comes from `pushToTalkKey` in `~/.config/robos/voice-prompt-prefs.json` and defaults to `Super+V`.
2. Speak. Text appears in bubbles marked "Listening" while it is interim and settles when you pause.
3. Click **Copy All** to copy every bubble to the clipboard, or use the "Save chat history as..." button to write them to a text file.

The window does not type into other applications. It also does not write the live feed to disk. Prompts that are saved with the active-app context go to `~/.config/robos/voice-prompts.json` (the last 500 are kept) when you use `POST /api/activate` followed by `POST /api/deactivate`, `POST /api/dictate`, or `robos-voice dictate`.

The context attached to a saved prompt comes from the focused window (`appId`, title, window class, id), the running RobOS apps, and the active workspace from `~/.config/robos/workspaces.json`. If that file is missing, the workspace falls back to the app's working directory and the branch `main`.

Other buttons in the window: the gear opens settings, the trash icon clears the bubbles, and the corner button cycles the window through the bottom-right, bottom-left, top-left and top-right corners. The choice is saved as `hudPosition`.

## Voice commands

When you stop speaking for 650 ms, the bubble text is matched against the registered voice commands. On a match, the bubble bounces and shows a card with an "App" or "Skill" badge, the command title, and a status that changes from "Executing" to "Done" or "Error".

Matching ignores a leading "hey", "hello", "hi", "ok" or "okay", an optional "robos", "rob os" or "row bose", and "please", "can you", "could you" or "would you". It then tries, in order: an exact match on a skill phrase, a wildcard match for skills that take an argument, an exact match or "open"/"launch" plus the name for apps, and finally a multi-word phrase contained in what you said. Skills are checked before apps.

| Say | What happens |
|---|---|
| "validate knowledge graph" | Runs the knowledge graph validation skill |
| "search knowledge graph for payments" | Runs the search skill with `payments` as the argument |
| "list tasks" | Lists tasks from the saved plan |
| "open dev central" | Launches the app |

Every app in the icon registry (`packages/robos-icons`) gets "open <name>" phrases. The skill commands are defined in [`lib/voice-commands-registry.js`](https://github.com/nddipiazza/robos/blob/main/packages/voice-prompt/lib/voice-commands-registry.js).

## Settings window

The gear in the floating window opens "RobOS Voice Settings" (720 by 640 pixels). It has two tabs.

| Tab | What it does |
|---|---|
| **Device** | Choose the dictation microphone from **Input device**, **Refresh** the list, and click **Save device**. The choice applies to the next recording, so stop dictation before you switch. **Test microphone** shows a live waveform without saving or transcribing audio. It stops when you click it again, change device, leave the tab, close the window, or after 30 seconds. |
| **RobOS Commands** | Lists every registered command with its trigger phrases and a count badge. A search box filters by title, description, target or phrase. The buttons **All Commands**, **Applications** and **Skills & Actions** filter by type. **Test** on a card, or clicking a phrase, sends that phrase to the floating window as if you had said it. `Esc` closes the window. |

## Speech output

`robos-voice speak` and `POST /api/speak` synthesize text and play it. The default engine is Kokoro with the voice `af_heart`. "RobOS" is rewritten to "Row Bose" before synthesis so that it is pronounced "row-bose".

| Engine | What it needs |
|---|---|
| `kokoro` | `python3` with the `kokoro_onnx` and `soundfile` modules, and the files `kokoro-v1.0.onnx` and `voices-v1.0.bin` in `~/.local/share/kokoro/` |
| `edge-tts` | The `edge-tts` command on the path. It is a client for an online Microsoft service, so it needs network access and sends the text off the machine. |
| `piper` | A `piper` binary on the path or at `~/.local/bin/piper`, and a model such as `~/.local/share/piper/voices/en_US-lessac-medium/en_US-lessac-medium.onnx` |

If the chosen engine is `kokoro` and it fails, the code tries Edge-TTS, then Piper if a Piper model is installed. If every engine fails, the call still returns `ok: true` with the engine reported as `fallback` and plays one second of silence generated with `ffmpeg`. If you hear nothing, check the `engine` field in the response.

Audio plays through `pw-play` when `/usr/bin/pw-play` exists. Otherwise it uses `ffplay` for MP3 files and `aplay` for WAV files. Settings posted to `/api/tts/config` apply to the running app; the code does not write them to disk.

## The assistant

`robos-voice assistant "<text>"` and `POST /api/assistant/chat` send text to the desktop assistant. It is a rule-based interpreter in [`lib/skills-executor.js`](https://github.com/nddipiazza/robos/blob/main/packages/voice-prompt/lib/skills-executor.js), not a language model. It recognizes greetings, "open <app>", "add a task ...", listing tasks, knowledge graph validate, search, impact and visualize, restarting the taskbar, reading error logs, running tests, git status and branch, the active window, system status, changing the voice, and stopping speech. It speaks the reply unless you pass `silent: true`.

Text that matches none of these gets the reply "Done: <your text>." and nothing else happens. No model is called.

## Not built yet

Hands-free activation by saying "hello robos" is not connected. `lib/wake-word.js` can detect phrases such as "hello robos", "hey row bose" and "rob os", and unit tests cover it, but nothing in the app passes the live speech stream to it. The same applies to the assistant's stream handler. `POST /api/wake-word/toggle` sets a flag that has no effect today.

## CLI

The command is the executable script `packages/robos-cli/robos-voice`. It talks to the HTTP API on `ROBOS_VOICE_PORT` (default `19188`).

```bash
packages/robos-cli/robos-voice status
packages/robos-cli/robos-voice context
packages/robos-cli/robos-voice speak "Row Bose is online" --engine kokoro --voice af_heart
packages/robos-cli/robos-voice stop-speaking
packages/robos-cli/robos-voice voices
packages/robos-cli/robos-voice assistant "What is the git status?"
packages/robos-cli/robos-voice background start
packages/robos-cli/robos-voice background stop
packages/robos-cli/robos-voice dictate "Refactor the authentication middleware"
packages/robos-cli/robos-voice activate
packages/robos-cli/robos-voice deactivate
packages/robos-cli/robos-voice list --limit 5
packages/robos-cli/robos-voice clear
```

`activate` and `deactivate` record one prompt and save it with context. `background start` turns on the ephemeral streaming mode: recognized speech is published to `GET /api/stream` subscribers and not saved.

## HTTP API

Base URL `http://127.0.0.1:19188`. Requests and responses are JSON unless noted.

{: .warning }
The API has no authentication and answers cross-origin requests from any origin (`Access-Control-Allow-Origin: *`). The server calls `listen(port)` without a host, so Node binds all network interfaces, not only the loopback address. Block port `19188` from other machines with a firewall.

| Method and path | Purpose |
|---|---|
| `GET /api/status` | Recording state, background mode, configured device, active window, prompt count, TTS engine, assistant state |
| `GET /api/stream` | Server-Sent Events with interim and final speech text |
| `POST /api/activate`, `POST /api/deactivate` | Start recording; stop, transcribe and save the prompt with context |
| `POST /api/dictate` | Save `{ "text": "..." }` as a prompt with context |
| `GET /api/context` | Focused window, running RobOS apps and workspace |
| `GET /api/prompts` (`?limit=`, `?app=`), `GET` or `DELETE /api/prompts/:id`, `DELETE /api/prompts` | Read and delete saved prompts |
| `GET /api/devices`, `GET` or `POST /api/config` | List capture devices; read and update preferences |
| `POST /api/speak`, `POST /api/stop-speaking`, `GET /api/voices`, `GET` or `POST /api/tts/config` | Speech output |
| `POST /api/background/start`, `POST /api/background/stop` | Ephemeral streaming mode |
| `POST /api/assistant/chat`, `GET` or `DELETE /api/assistant/history` | Assistant |
| `GET /api/voice-commands` (`?q=`, `?category=all\|apps\|skills`) | List commands |
| `POST /api/voice-commands/match`, `POST /api/voice-commands/execute` | Match `{ "text" }`; run `{ "commandId", "args", "text" }` |
| `GET /api/skills`, `POST /api/skills/execute` | List skills; run `{ "command" }` through the assistant |
| `POST /api/stream/simulate` | Push `{ "text", "isFinal" }` into the speech stream, for tests |
| `GET /screenshot`, `GET /health` | PNG of the floating window; health check |

## Tests

```bash
node --test packages/robos-test/tests/voice-prompt/unit.test.js
node --test packages/robos-test/tests/voice-prompt/voice-commands.test.js
node --test packages/robos-test/tests/voice-prompt/stream-assistant.test.js
```

The `e2e.test.js` file in the same folder drives the app with Electron. The other files there cover TTS, device routing, agent streaming and skills.

## Related pages

- [Apps]({{ site.baseurl }}{% link apps.md %})
- [Get started]({{ site.baseurl }}{% link getting-started.md %})
