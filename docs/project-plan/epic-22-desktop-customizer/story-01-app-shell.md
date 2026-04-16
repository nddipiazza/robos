# Story 22-01: Desktop Customizer App Shell and Prompt Interface

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 5

## Description

Create the Desktop Customizer Electron app with a chat-style prompt interface. The user types natural language or slash commands, and the app interprets and executes desktop modifications.

### UI Layout

- **Chat pane** (left, 60%) — scrolling conversation with the AI. User messages, AI responses, command outputs, before/after previews
- **Sidebar** (right, 40%) — tabbed: Slash Commands reference, Snapshot History, Current Config summary
- **Input bar** (bottom) — prompt input with `/` autocomplete, send button, and a "danger mode" toggle

### Slash Command Autocomplete

When the user types `/`, show a filterable dropdown of all available commands with descriptions. Tab to autocomplete, Enter to execute.

### Conversation History

Persist conversation history to `~/.config/robos/desktop-customizer/history.json`. Load on app start so users can see what they changed previously.

### Danger Mode Indicator

A persistent banner when the user is about to do something destructive:

> ⚠️ **Power mode active** — You're about to modify core desktop settings. Changes are snapshotted automatically, but may require a logout to take effect. [Proceed] [Cancel]

## Acceptance Criteria

- [ ] Electron app with chat-style UI launches from App Launcher
- [ ] Slash command autocomplete works with `/` trigger
- [ ] Conversation history persists across sessions
- [ ] Danger mode confirmation shows for destructive commands
- [ ] App registered in desktop-manager, robos-icons, icon-lib
