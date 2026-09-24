---
title: "Voice Prompt Agent"
package: voice-prompt
category: ai-agents
icon: voice-prompt.svg
summary: "Offline neural Whisper speech-to-text dictation with real-time streaming and active desktop window context capture."
related:
  - /voice-prompt.html
---

An offline neural speech-to-text dictation agent engineered for hands-free AI prompt authoring with real-time streaming and automated desktop context enrichment:
- **100% On-Device Neural Whisper STT**: Uses on-device ONNX runtime models via `@xenova/transformers` (`whisper-tiny.en`). Transcribes speech completely offline with zero SaaS dependencies and zero cloud data leaks.
- **Real-Time Live Streaming Dictation**: Continuous audio chunking transcribes speech every ~2 seconds. Words stream live into the UI and via Server-Sent Events (`GET /api/stream`).
- **Automated Desktop Context Injection**: Silently captures focused X11/Wayland window titles, application class (`vscode`, `idea`, `browser`, `terminal`), active PID, current working directory, and Git branch—attaching high-signal developer context to every voice prompt.
- **Global Push-to-Talk Hotkey (`Super+V`)**: Summon dictation globally from any running RobOS app or terminal without losing focus or context.
- **Audio Waveform Feedback**: Real-time microphone input visualization with animated volume amplitude bars via Web Audio API `AnalyserNode`.
- **Universal REST API (`:19188`) & CLI (`robos-voice`)**: Control microphone listening, query active context, stream transcripts, and manage saved prompts programmatically. Read the full [Voice Prompt Dictation Guide]({{ site.baseurl }}{% link voice-prompt.md %}).
![Voice Prompt Agent]({{ '/assets/images/voice-prompt-architecture.jpg' | relative_url }})
