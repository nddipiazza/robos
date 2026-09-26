---
title: RobOS Voice — Bi-directional Voice & Desktop Assistant
layout: default
parent: Use RobOS
nav_order: 3
permalink: /voice-prompt.html
---

# RobOS Voice — Bi-directional Voice & Desktop Assistant
{: .no_toc }

Bi-directional, 100% privacy-first voice interaction engineered for AI-first software development. Features lifelike neural text-to-speech (Kokoro-82M and Edge-TTS), ambient background stream listening with wake-word detection ("hello robos", "rob OS", "row bose"), desktop context injection, and an interactive out-loud Desktop Assistant.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Bi-directional Voice in AI-Driven Development

In the era of autonomous coding agents (Claude Code, Google Antigravity, GitHub Copilot, OpenAI Codex), software engineering speed is no longer limited by how fast developers write boilerplate syntax—it is bottlenecked by **prompt authoring and review bandwidth**:

- **The Speaking vs. Typing Speed Gap**: Average developers type between 40 to 65 words per minute (WPM). Natural speech occurs at 140 to 180 WPM—nearly **3x to 4x faster**.
- **Context Switching Friction**: To instruct an AI agent on a bug or refactor, a developer traditionally must stop, switch windows, open an AI chat, manually type file names, paste error lines, specify the active Git branch, and explain what they were looking at.
- **Robotic Audio Fatigue**: Conventional developer TTS engines (espeak, standard Piper voices) sound mechanical and robotic. Developers need warm, lifelike neural voices for long reviews and conversational debugging.
- **Privacy & Air-Gap Compliance**: Sending raw audio streams to commercial cloud speech APIs introduces compliance, latency, cost, and secret leakage risks for enterprise engineering codebases.

### The RobOS Solution: RobOS Voice

The **RobOS Voice** platform (`packages/voice-prompt`, CLI: `robos-voice`, library: `packages/robos-lib/voice.js`) provides a full-duplex bi-directional voice pipeline:

1. **Natural Outgoing Neural Voice (TTS)**: High-fidelity speech synthesis featuring **Kokoro-82M** (24kHz warm open-source offline TTS) and **Edge-TTS** (Microsoft Studio-grade neural voices with zero API keys).
2. **Strict "Row Bose" Phonetic Pronunciation**: Integrated speech normalization guarantees that "RobOS" is phonetically pronounced as *"Row Bose"* across all voice engines.
3. **Continuous Background Topic Stream**: Ambient voice listening emits speech chunks directly to subscriber topics without cluttering disk or prompt storage unless explicitly consumed.
4. **Hands-free Wake-Word Detection**: Listens on the continuous stream for `"hello robos"`, `"rob OS"`, and `"row bose"` (and phonetic variants like *rowbose* and *roh bose*).
5. **Interactive Desktop Assistant**: Connects the wake-word listener, active window context, and AI agent reasoning to speak answers back out loud to the developer.
6. **100% Local Neural Whisper STT**: On-device ONNX runtime models via `@xenova/transformers` (`whisper-tiny.en`). Audio never leaves the local machine.
7. **Automated Desktop Context Injection**: Automatically attaches focused window titles, application class (`vscode`, `idea`, `browser`, `terminal`), active PID, current working directory, and Git branch.

---

## 2. System Architecture & Multimodal Pipeline

```mermaid
flowchart TD
    subgraph Audio Input & STT
        Mic[Microphone Input] --> Capture[Audio Capture: pw-record / arecord / sox]
        Capture --> Whisper[Local Neural Whisper STT ONNX]
        Whisper --> Stream[Continuous Topic Stream]
    end

    subgraph Wake Word & Assistant
        Stream --> WakeDetector{"Wake Word Detector\n'hello robos' | 'rob OS' | 'row bose'"}
        WakeDetector -->|Triggered Query| Assistant[RobOS Desktop Assistant]
        Context[Desktop Context Provider: X11/Wayland + Git] --> Assistant
        Agent[Autonomous Agent / LLM Bridge] <--> Assistant
    end

    subgraph Outgoing Voice TTS
        Assistant --> PhoneticEngine["Phonetic Engine: 'RobOS' -> 'Row Bose'"]
        PhoneticEngine --> TTSEngine{TTS Engine Selector}
        TTSEngine -->|Offline Lifelike| Kokoro["Kokoro-82M (24kHz ONNX)"]
        TTSEngine -->|Studio Grade| EdgeTTS["Edge-TTS (Andrew / Ava Neural)"]
        TTSEngine -->|Fallback| Piper["Piper / Speech-Dispatcher"]
        Kokoro --> Playback[Audio Output / Speakers]
        EdgeTTS --> Playback
        Piper --> Playback
    end
```

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/robos-voice-architecture.jpg' | relative_url }}" alt="RobOS Voice Architecture Diagram" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Voice Architecture</strong>: Bi-directional neural voice pipeline connecting ambient Whisper stream listening, wake-word detection, context-aware desktop assistant, and lifelike Kokoro/Edge-TTS speech output. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## 3. Outgoing Voice (Natural Neural TTS)

RobOS Voice includes a high-performance, non-robotic outgoing speech engine (`lib/tts-engine.js`):

### 3.1 Supported Voice Engines

| Engine | Type | Sample Rate | Description |
|---|---|---|---|
| **Kokoro-82M** (`kokoro`) | Local Offline Neural | 24,000 Hz | State-of-the-art open-source 82M parameter neural TTS. Produces warm, lifelike human cadence. Model stored locally at `~/.local/share/kokoro/kokoro-v1.0.onnx`. |
| **Edge-TTS** (`edge-tts`) | Studio Neural | 24,000 Hz | High-quality Microsoft Azure neural speech voices (`en-US-AndrewMultilingualNeural`, `en-US-AvaMultilingualNeural`) accessible with zero account or API key required. |
| **Piper** (`piper`) | Local Fast Neural | 22,050 Hz | Ultra-fast local neural TTS model (`en_US-lessac-medium`). |
| **Speech Dispatcher** (`speech-dispatcher`) | System Local | Varies | Local Linux standard speech synthesizer fallback (`spd-say`). |

### 3.2 Phonetic Normalization: Pronouncing "Row Bose"

To ensure consistent branding and natural pronunciation, all outgoing speech passes through the phonetic pre-processor (`prepareSpeechText`):

```javascript
// Ensures RobOS is pronounced "Row Bose" like Bose speaker system
text = text.replace(/\bRobOS\b/gi, 'Row Bose');
text = text.replace(/\bRob-OS\b/gi, 'Row Bose');
```

---

## 4. Background Topic Streaming & Wake-Word Detection

### 4.1 Ephemeral Topic Stream Mode

When background mode is enabled (`POST /api/background/start`), the microphone streams continuous audio chunks through the Whisper STT engine:

- **No Disk Pollution**: Speech chunks are emitted live as `stream-text` events to active subscribers.
- **Zero Save Default**: Unlike dictation mode, speech recognized in background mode is **not written** to the persistent `voice-prompts.json` file. It operates strictly like a pub/sub message topic.

### 4.2 Wake-Word Triggers

The wake-word detector (`lib/wake-word.js`) monitors the live stream for trigger phrases:

- **"hello robos"**
- **"rob OS"**
- **"row bose"** (including variants: `row-bose`, `rowbose`, `roh bose`)

When a wake word is detected, it strips the wake phrase and extracts the trailing instruction to immediately dispatch to the Desktop Assistant.

---

## 5. RobOS Desktop Assistant

The **RobOS Desktop Assistant** (`lib/desktop-assistant.js`) provides hands-free pair programming:

1. **Trigger**: Listens for wake words or explicit API prompts (`POST /api/assistant/chat`).
2. **Context Enrichment**: Gathers focused application name, window title, PID, and Git branch from `ContextProvider`.
3. **Agent Reasoning**: Sends the query and desktop context to the RobOS AI Agent loop.
4. **Spoken Response**: Speaks the response out loud using the configured natural neural voice.
5. **State Lifecycle**: Emits real-time state changes (`IDLE`, `WAKE_DETECTED`, `LISTENING`, `PROCESSING`, `SPEAKING`).

---

## 6. Voice Activated Commands & Knowledge Graph Integration

RobOS Voice bridges hands-free speech dictation directly to autonomous SDLC actions through the **Voice Activated Commands** engine (`lib/voice-commands-registry.js`). Every skill across the RobOS skills catalog and every application across the desktop suite can expose voice activated commands that are automatically matched when developer speech settles.

### 6.1 Knowledge Graph SHACL Shape: `robos:VoiceCommand`

Voice commands are registered as first-class, optional semantic entities in the RobOS Dual-State Knowledge Graph conforming to the W3C SHACL shape `urn:robos:shape:VoiceCommandShape` (derived from Schema.org `schema:ControlAction`):

```turtle
# W3C SHACL Shape Definition
urn:robos:shape:VoiceCommandShape a sh:NodeShape ;
    sh:targetClass robos:VoiceCommand ;
    rdfs:isDefinedBy <https://schema.org/ControlAction> ;
    sh:property [
        sh:path dcterms:title ;
        sh:minCount 1 ;
        sh:message "Voice command must have a title." ;
    ] ;
    sh:property [
        sh:path robos:commandMatcher ;
        sh:minCount 1 ;
        sh:message "Voice command must have at least one command matcher phrase." ;
    ] ;
    sh:property [
        sh:path robos:targetType ;
        sh:minCount 1 ;
        sh:message "Voice command must specify target type (app or skill)." ;
    ] ;
    sh:property [
        sh:path robos:targetId ;
        sh:minCount 1 ;
        sh:message "Voice command must specify a target application or skill ID." ;
    ] .
```

Applications and skills declare their voice commands via the `robos:hasVoiceCommand` relationship in their respective modular package definitions (such as `.robos/kgraphs/applications/package.jsonld`).

### 6.2 Command Matching & Execution Pipeline

```mermaid
flowchart TD
    Speech[Recognized Speech Stream] --> Settle["Settle Debounce Window\n(650ms Quiet Period)"]
    Settle --> Matcher{"Voice Command Matcher\nExact • Wildcard • Prefix Strip"}
    Matcher -->|No Match| Bubble[Standard Speech Bubble]
    Matcher -->|Matched Command| Bounce["HUD Bubble Bounce Effect\n@keyframes commandBounce"]
    Bounce --> Card[Format Bubble with Command Card]
    Card --> Dispatch{Target Type Dispatch}
    Dispatch -->|Skill| MCP["Execute Skill / MCP Tool Action\n(SkillsExecutor)"]
    Dispatch -->|App| IPC["Launch / Focus App\n(Electron Desktop IPC)"]
    MCP --> Result["Update Status Badge (Done / Error)\nand Render Result Output"]
    IPC --> Result
```

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/voice-commands-architecture.jpg' | relative_url }}" alt="RobOS Voice Activated Commands & Knowledge Graph Pipeline Architecture Diagram" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Voice Activated Commands Architecture</strong>: End-to-end schematic connecting audio stream transcription, settle debounce gating, multi-token matching engine, W3C SHACL shape validation in the Dual-State Knowledge Graph, action dispatch to skills and apps, and real-time HUD bubble bounce status formatting. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## 7. Floating HUD & In-App Configuration Modal

RobOS Voice features a discreet, semi-transparent floating desktop HUD positioned at the corner of your screen (customizable to Bottom-Right, Top-Right, Bottom-Left, or Top-Left).

### 7.1 Speech Bubble Settle Window & Bounce Animation

As speech is dictated, words appear live in real-time bubbles:

1. **Settle Debounce (650ms)**: When the developer pauses speaking, the bubble enters a 650ms settle window. If no new words arrive, the finalized text is evaluated against the voice commands matching engine.
2. **Bounce Animation Effect**: When a command matches, the dialog bubble triggers a `@keyframes commandBounce` animation, dynamically scaling and pulsing with a glowing cyan accent.
3. **Execution Card**: The bubble automatically formats to display an execution card featuring:
   - Target category badge (`App` or `Skill`) with lightning icon.
   - Command title and live status indicator (`Executing` $\to$ `✓ Done` or `✕ Error`).
   - Detailed execution feedback (e.g., Knowledge Graph SHACL validation report or app launch confirmation).

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/robos-voice-hud-bubble-command.png' | relative_url }}" alt="RobOS Voice HUD with Matched Voice Command and Formatted Status Card" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Voice Floating HUD</strong>: Real-time dictation feed displaying finalized speech bubbles, matched app and skill execution cards with live status badges, copy-to-clipboard buttons, and active stream listening.
  </div>
</div>

### 7.2 In-App Voice Activated Commands Configuration Modal

Clicking the terminal icon button (`>_`) in the HUD header opens the interactive **Voice Activated Commands** configuration modal:

- **Command Count Badge**: Displays the total count of registered voice commands across all active skills and desktop apps.
- **Instant Search Filter**: Filter commands in real time by title, description, target identifier, or trigger phrases.
- **Category Filter Tabs**: Switch between **All**, **Apps**, and **Skills** to isolate specific workflows.
- **Clickable Trigger Phrase Badges**: Each command displays its supported spoken trigger phrases (e.g., `“open git projects”`, `“validate knowledge graph”`). Clicking any badge immediately runs that phrase as test dictation.
- **Direct Test Runner**: Each card includes a `Test` button to trigger immediate execution without speaking.

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin: 2rem 0;">
  <div style="border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
    <img src="{{ '/assets/images/screenshots/robos-voice-commands-modal.png' | relative_url }}" alt="RobOS Voice Commands Configuration Catalog Modal" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
    <div style="padding: 0.75rem 1rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
      <strong>Voice Commands Configuration Modal</strong>: Searchable directory of voice-activated skills and apps with trigger pills and test buttons.
    </div>
  </div>

  <div style="border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
    <img src="{{ '/assets/images/screenshots/robos-voice-commands-search.png' | relative_url }}" alt="RobOS Voice Commands Search Filter" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
    <div style="padding: 0.75rem 1rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
      <strong>Live Search Filter</strong>: Rapid keyword search isolating Knowledge Graph validation, search, impact analysis, and export skills.
    </div>
  </div>
</div>

---

## 8. RobOS Voice Library (`packages/robos-lib/voice.js`)

Other RobOS Electron applications, CLI scripts, and AI agent skills can interact with the voice engine via the JavaScript client library:

```javascript
const { RobOSVoiceClient, voice } = require('/usr/local/share/robos/robos-lib');
// Or import directly from packages/robos-lib/voice.js

// Speak out loud with lifelike neural voice
await voice.speak('Task completed successfully. All unit tests passed.');

// Query available voices
const voices = await voice.getVoices();

// Send query to Desktop Assistant
const reply = await voice.chatAssistant('What branch am I currently working on?');
console.log('Assistant replied:', reply.response);

// Control background stream listening
await voice.startBackgroundStream();
```

---

## 9. CLI Workflows (`robos-voice`)

The `robos-voice` CLI tool provides complete terminal control:

```bash
# Check daemon status
robos-voice status

# Speak text using natural neural voice
robos-voice speak "Row Bose is online and ready."

# Stop currently playing speech
robos-voice stop-speaking

# List available voices across Kokoro, Edge-TTS, and Piper
robos-voice voices

# Query Desktop Assistant hands-free
robos-voice assistant "What is the git status in the active window?"

# Start / stop background continuous streaming mode
robos-voice background start
robos-voice background stop

# Push-to-talk dictation commands
robos-voice activate
robos-voice deactivate
robos-voice context
robos-voice list --limit 5
```

---

## 10. REST API Reference (`:19188`)

RobOS Voice exposes an HTTP REST server on port `19188`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/voice-commands` | List all discovered voice commands (`?q=&category=all\|apps\|skills`) |
| `POST` | `/api/voice-commands/match` | Evaluate text against command matchers (`{ text }`) |
| `POST` | `/api/voice-commands/execute` | Execute a voice command with arguments (`{ commandId, args, text }`) |
| `GET` | `/screenshot` | Capture high-resolution PNG screenshot of the active HUD window |
| `POST` | `/api/speak` | Synthesize and speak text out loud (`{ text, engine, voice, rate, pitch }`) |
| `POST` | `/api/stop-speaking` | Stop all active audio playback |
| `GET` | `/api/voices` | List all discovered TTS voices grouped by engine |
| `GET` | `/api/tts/config` | Get current TTS configuration |
| `POST` | `/api/tts/config` | Update default TTS engine, voice, and speed |
| `POST` | `/api/background/start` | Start ephemeral background stream listening |
| `POST` | `/api/background/stop` | Stop background stream listening |
| `POST` | `/api/assistant/chat` | Send a query to the Desktop Assistant (`{ message, speak }`) |
| `GET` | `/api/assistant/history` | Get recent conversation history |
| `DELETE`| `/api/assistant/history` | Clear conversation history |
| `POST` | `/api/wake-word/toggle` | Enable or disable wake word detection (`{ enabled }`) |
| `GET` | `/api/status` | Get daemon health, microphone state, and assistant status |
| `GET` | `/api/context` | Capture real-time focused window and Git context |
| `POST` | `/api/activate` | Start microphone push-to-talk recording |
| `POST` | `/api/deactivate` | Stop recording and transcribe to persistent prompt storage |
| `GET` | `/api/prompts` | Query recorded prompt history |
| `GET` | `/api/stream` | Server-Sent Events (SSE) live speech stream |

---

## 11. Verification & Testing

RobOS Voice includes full test coverage for TTS, background streaming, wake-word detection, voice commands, and assistant workflows:

```bash
# Run voice command and unit tests
node --test packages/robos-test/tests/voice-prompt/voice-commands.test.js
node --test packages/robos-test/tests/voice-prompt/unit.test.js
node --test packages/robos-test/tests/voice-prompt/skills-voice.test.js

# Verify W3C SHACL validation conformance across all packages
node packages/robos-graph/bin/kgraph-cli.js validate
```

---

## Next Steps

- **[Browse All RobOS Apps]({{ site.baseurl }}{% link apps.md %})**: View the full suite of native developer tools.
- **[RobOS Architecture]({{ site.baseurl }}{% link architecture.md %})**: Learn about the 4-tier desktop bridge and Knowledge Graph governance.
- **[Agent Code Review Platform]({{ site.baseurl }}{% link pr-review-theater.md %})**: Explore the 6-stage PR Review Theater.
