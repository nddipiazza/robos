---
name: robos-voice
description: Interact with the RobOS Voice subsystem to speak to the user aloud in natural human voice (Kokoro-82M / Edge-TTS), monitor continuous background speech streams, or command the RobOS Desktop Assistant.
---

# RobOS Voice Skill

Interact with the **RobOS Voice** desktop app and voice subsystem. AI agents can use this skill to speak progress, completions, or questions out loud to the developer in ultra-natural human voices (Kokoro-82M, Edge-TTS), check voice listener stream status, or coordinate with the RobOS Desktop Assistant.

> [!NOTE]
> Pronunciation: RobOS is phonetically pronounced **"Row Bose"** (like Bose speaker system). All speech synthesis automatically applies this pronunciation rule.

## Input

`$ARGUMENTS` — Action and parameters:
- `speak "<message>" [--engine <kokoro|edge-tts|piper>] [--voice <voice_id>]` — Speak text out loud to the user.
- `stop` — Halt active audio speech playback.
- `voices` — List available natural voice models.
- `assistant "<query>"` — Send a query to the RobOS Desktop Assistant with active desktop context and spoken audio reply.
- `background <start|stop>` — Toggle continuous background streaming topic mode (ephemeral, not persisted).
- `status` — Check running status, active modes, and microphone device.

---

## Procedures

### 1. Speaking to the User
When completing a major milestone, notifying of a test failure, or answering an architect request:
```bash
./packages/robos-cli/robos-voice speak "Task completed successfully. All unit and integration tests are passing."
```
To use a specific natural voice:
```bash
# Kokoro-82M (Default offline open-source warm natural female voice)
./packages/robos-cli/robos-voice speak "Hello! I am speaking via Kokoro." --engine kokoro --voice af_heart

# Edge-TTS (Default free studio copilot male voice)
./packages/robos-cli/robos-voice speak "Hello! I am speaking via Edge TTS." --engine edge-tts --voice en-US-AndrewMultilingualNeural
```

### 2. Querying the Desktop Assistant
To query the assistant with full active desktop window and workspace context:
```bash
./packages/robos-cli/robos-voice assistant "What is the git status?"
```

### 3. Using in Node.js Code
Import the official `robos-lib` voice wrapper:
```javascript
const { voice } = require('/usr/local/share/robos/robos-lib'); // or require('robos-lib')

// Speak text out loud
await voice.speak("Build successful. Ready for review.");

// Ask Desktop Assistant
const reply = await voice.askAssistant("What is the status of the project?");
console.log(reply.turn.response);
```

### 4. Background Stream Topic Mode
In background mode, the microphone stream continuously transcribes speech into ephemeral real-time SSE chunks (`/api/stream`). Nothing is saved to disk by default unless wake-word `"hello robos"` (or `"rob os"` / `"row bose"`) is detected.
```bash
./packages/robos-cli/robos-voice background start
./packages/robos-cli/robos-voice background stop
```

---

## Validation
- Verify speech synthesis plays cleanly without errors.
- Confirm pronunciation of RobOS as "Row Bose".
- Confirm status returns healthy with configured engine and active state.
