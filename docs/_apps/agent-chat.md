---
title: "Agent Chat"
package: agent-chat
category: ai-agents
icon: agent-chat.svg
summary: "VS Code & Cursor-style conversational AI assistant with multi-model switcher, live tool cards, and quick prompt popup."
---

A native conversational interface inspired by VS Code Copilot Chat and Cursor, engineered specifically for autonomous SDLC workflows:
- **Multi-Model & Mode Switching**: Seamlessly switch between Claude 3.7 Sonnet, OpenAI o3-mini, Gemini 2.5 Flash, Antigravity Harness, and local Ollama, with dedicated interaction modes (`Agent`, `Chat`, `Edit`, `Review`).
- **Live Tool Execution Traces**: View real-time MCP tool invocations and results across RobOS apps (System Topology Studio, Relational DB Manager, REST API Client, Kube Studio, PR Review Theater).
- **Code Block Actions**: Syntax-highlighted code snippets with one-click `Copy` and `Insert` directly into your workspace files.
- **Global AI Prompt Pop-up Integration**: Click `Pop Out Prompt` or press `Ctrl+Space` to summon the lightweight floating RobOS Agent Prompt directly over any running application to issue quick commands that drive background tools.

![Agent Chat]({{ '/assets/images/screenshots/agent-chat.png' | relative_url }})
