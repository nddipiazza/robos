---
nav_exclude: true
---

# Story 22-10: LLM Integration — Claude-Powered Conversational Customization

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 8

## Description

The AI brain that makes everything conversational. Instead of memorizing slash commands, users just describe what they want in plain English (or any language).

### Natural Language → Slash Commands

The LLM translates natural language into one or more slash commands, shows the user what it's about to do, and executes on approval.

```
User: "I want the clock on the left, bigger taskbar, and a dark red accent"

AI: I'll make these changes:
  1. /move-clock left
  2. /taskbar height 48px
  3. /theme accent #dc2626

  [Execute All] [Edit] [Cancel]
```

### Complex Multi-Step Requests

```
User: "Set up my desktop for a demo — hide all the dev tools,
       make the taskbar minimal, add a large clock widget,
       and replace the desktop with the Manager Dashboard"

AI: Here's the plan:
  1. /menu hide dev-tools git-login-manager pass-manager security-setup
  2. /taskbar autohide on
  3. /taskbar height 32px
  4. /widget add clock --position center --size 400x200 --style minimal
  5. /replace-desktop manager-dashboard

  ⚠️ Step 5 replaces your desktop. Use `/restore last` to undo.
  [Execute All] [Execute Step by Step] [Cancel]
```

### App Building via Conversation

```
User: "I need a simple app that shows a countdown to our next release
       date, March 30th. Big numbers, dark background, maybe confetti
       when it hits zero"

AI: I'll build a Release Countdown app:
  - Full-screen countdown timer (days:hours:minutes:seconds)
  - Dark background matching RobOS theme (#0d1117)
  - Confetti animation on zero using canvas-confetti
  - Target date configurable via right-click context menu

  [Build It] [Modify Description] [Cancel]
```

### Context Awareness

The LLM has access to:
- Current desktop state (gsettings dump, active extensions, widgets, theme)
- Available slash commands and their parameters
- Previously made customizations (conversation history)
- Installed RobOS apps and their capabilities
- The snapshot history (for undo references)

### Provider Support

- **Primary**: Claude (via Anthropic API or Claude Code CLI)
- **Fallback**: Any OpenAI-compatible API (GPT-4, local models via Ollama)
- Configured in RobOS Preferences → AI Settings

### Streaming

AI responses stream token-by-token to the chat UI. Command execution results are also streamed (especially for `/build-app` which takes several seconds).

## Acceptance Criteria

- [ ] Natural language input is translated to slash command sequences
- [ ] User sees the plan before execution and can approve/edit/cancel
- [ ] Multi-step requests are broken down and shown as a numbered plan
- [ ] `/build-app` works via conversational description
- [ ] AI has context of current desktop state and history
- [ ] Streaming responses show token-by-token in chat
- [ ] Works with Claude API; falls back to OpenAI-compatible APIs
- [ ] Dangerous commands show appropriate warnings before execution
