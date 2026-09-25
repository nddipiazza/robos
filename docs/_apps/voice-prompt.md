---
title: "RobOS Voice"
package: voice-prompt
category: ai-agents
icon: voice-prompt.svg
summary: "Bi-directional voice assistant with lifelike neural TTS (Kokoro-82M & Edge-TTS), continuous stream listening ('hello robos' / 'rob OS' / 'row bose'), Whisper STT, and desktop assistant."
related:
  - /voice-prompt.html
---

A bi-directional, privacy-first voice assistant engineered for hands-free AI interaction, ambient stream listening, and lifelike neural speech generation:
- **Natural Outgoing Neural Voice (TTS)**: Features high-fidelity neural speech engines including **Kokoro-82M** (24kHz warm open-source offline TTS) and **Edge-TTS** (studio-grade neural voices with zero API keys), with phonetic calibration ensuring RobOS is pronounced as *"Row Bose"*.
- **Continuous Topic Stream Listening**: Operates in an ephemeral background stream mode where ambient speech is emitted to subscriber topics without filling local prompt disk storage unless explicitly consumed.
- **Wake-Word Detection**: Listens directly on the live audio stream for `"hello robos"`, `"rob OS"`, and `"row bose"` triggers to wake the assistant hands-free.
- **RobOS Desktop Assistant**: Streams recognized speech in real time, enriches developer queries with active window and Git repository context, and responds out loud using the natural voice engine.
- **100% On-Device Neural Whisper STT**: Transcribes developer speech offline with `@xenova/transformers` ONNX runtime models (`whisper-tiny.en`), keeping proprietary enterprise codebase discussions safe from cloud data leaks.
- **Universal REST API (`:19188`), Node.js Library (`robos-lib/voice`), & CLI (`robos-voice`)**: Full programmatic control over speech generation, microphone capture, wake-word activation, and assistant dialogues.

### Architecture Overview

```mermaid
flowchart LR
    Mic[Microphone Input] --> STT[Whisper Neural STT]
    STT --> Stream[Ephemeral Stream Topic]
    Stream --> Wake{"Wake Word Detector\nhello robos / rob OS / row bose"}
    Wake -->|Triggered| Assistant[RobOS Desktop Assistant]
    Context[Active Desktop & Git Context] --> Assistant
    Assistant --> TTS["Outgoing Voice TTS\nKokoro-82M / Edge-TTS\n'Row Bose' Phonetic Engine"]
    TTS --> Speaker[Audio Output]
```

<div style="margin: 1.5rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b;">
  <img src="{{ '/assets/images/robos-voice-architecture.jpg' | relative_url }}" alt="RobOS Voice Architecture Diagram" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.5rem 1rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Voice Architecture</strong>: Bi-directional neural voice pipeline connecting ambient Whisper stream listening, wake-word detection, context-aware desktop assistant, and lifelike Kokoro/Edge-TTS speech output.
  </div>
</div>

Read the complete [RobOS Voice Guide]({{ site.baseurl }}{% link voice-prompt.md %}).
