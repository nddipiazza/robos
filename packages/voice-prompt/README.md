# RobOS Voice Prompt Agent (`packages/voice-prompt`)

> **Offline Speech-to-Text Dictation Agent with Real-Time Desktop App Context Capture and REST API.**

Voice Prompt Agent bridges natural developer speech to autonomous AI coding agents (Claude Code, Google Antigravity, GitHub Copilot, OpenAI Codex) with zero cloud dependencies and zero SaaS fees.

---

## Features

- **100% Offline Neural Whisper STT**: Uses on-device ONNX runtime models via `@xenova/transformers` (`whisper-tiny.en`). Audio never leaves the local machine.
- **Live Streaming Dictation**: Speech is captured and transcribed continuously every ~2 seconds. Words stream live into the UI and over Server-Sent Events (`GET /api/stream`).
- **Active Desktop Context Enrichment**: Automatically detects active window title, PID, application class (`vscode`, `idea`, `browser`, `terminal`), working directory, and Git branch.
- **Global Hotkey (`Super+V`)**: Push-to-talk toggle from any application or terminal window.
- **Visual Waveform**: Real-time microphone input volume visualization via Web Audio API `AnalyserNode`.
- **Headless HTTP REST API (`:19188`)**: Control listening, query active context, stream transcripts, and manage saved prompts.
- **Command-Line Interface**: Run `robos-voice` or `robos-voice-prompt` from any terminal or script.

---

## Directory Structure

```
packages/voice-prompt/
├── bin/
│   └── robos-voice-prompt       # Executable wrapper script
├── lib/
│   ├── context-provider.js     # Desktop active window, PID, & Git context inspector
│   ├── prompt-store.js         # Persistent JSON store (~/.config/robos/voice-prompts.json)
│   └── stt-engine.js           # Offline Whisper ONNX STT engine & audio capture
├── renderer/
│   ├── app.js                  # Frontend vanilla JS UI & audio waveform logic
│   ├── index.html              # Modern dark-navy Electron interface
│   └── style.css               # Styling and recording pulse animations
├── icon.svg                    # 48x48 cyan Lucide-style microphone icon
├── main.js                     # Electron main process, HTTP API server (:19188), global hotkey
├── package.json
├── preload.js                  # Hardened contextBridge IPC interface
└── voice-prompt.desktop        # XDG desktop launcher entry
```

---

## Running the Application

```bash
# Launch via Electron directly
npx electron packages/voice-prompt

# Launch via wrapper binary
packages/voice-prompt/bin/robos-voice-prompt

# Run in test mode (bypasses microphone hardware requirements)
ROBOS_TEST=1 npx electron packages/voice-prompt
```

---

## HTTP REST API (`http://127.0.0.1:19188`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Agent state, recording status, active focused app, total prompts |
| `GET` | `/api/stream` | Server-Sent Events (SSE) live interim transcription stream |
| `POST` | `/api/activate` | Activate microphone listening (`{ "device": "default" }`) |
| `POST` | `/api/deactivate` | Stop recording, finalize Whisper transcription, attach context |
| `POST` | `/api/dictate` | Programmatic dictation injection (`{ "text": "..." }`) |
| `GET` | `/api/prompts` | List recorded prompts (`?limit=N`, `?app=appId`) |
| `POST` | `/api/prompts` | Manually insert a voice prompt record |
| `DELETE` | `/api/prompts/:id` | Delete prompt by ID |
| `DELETE` | `/api/prompts` | Clear all prompts |
| `GET` | `/api/devices` | List audio input hardware devices |
| `GET` | `/api/context` | Query real-time active window and Git repository context |

---

## CLI Usage (`robos-voice`)

```bash
# Check status
packages/robos-cli/robos-voice status

# Query active window context
packages/robos-cli/robos-voice context

# Push-to-talk activation
packages/robos-cli/robos-voice activate
packages/robos-cli/robos-voice deactivate

# Record a prompt directly from the shell
packages/robos-cli/robos-voice dictate "Refactor authentication middleware"

# List recent prompts
packages/robos-cli/robos-voice list --limit 5
```

---

## Testing

```bash
# Run unit tests (WAV parser, STT engine, API endpoints, storage)
node --test packages/robos-test/tests/voice-prompt/unit.test.js

# Run headless E2E tests (DOM assertions, device picker, activation flow)
node --test packages/robos-test/tests/voice-prompt/e2e.test.js
```

---

## Knowledge Graph Specification

Voice Prompt Agent is declared in `.robos/kgraphs/applications/package.jsonld` under `urn:robos:app:voice-prompt` conforming to W3C SHACL shape `urn:robos:shape:DesktopAppShape` and Schema.org `https://schema.org/SoftwareApplication`.
