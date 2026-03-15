---
layout: default
title: robos-ui (UI Component Library)
parent: RobOS App Suite
nav_order: 30
---

# robos-ui

> Shared Web Component library used by all RobOS Electron renderer processes. Zero build step — include with a single `<script>` tag.

---

## Overview

`robos-ui` is a self-contained JavaScript component library that provides reusable, AI-aware UI components for every RobOS Electron app. It ships as a single file (`robos-ui.js`) with no dependencies and no build step required. All styling is injected at runtime via a `<style>` tag, making it drop-in for any HTML renderer page.

---

## Installed Location

```
/usr/local/share/robos/robos-ui/robos-ui.js
```

Reference it in any Electron renderer HTML:

```html
<script src="/usr/local/share/robos/robos-ui/robos-ui.js"></script>
```

---

## Components

### `<robos-ai-textarea>`

An AI-powered multi-line textarea designed for prompting Copilot CLI. Features include slash command palette, `@`-mention file picker, streaming response display, context chip bar, and an inline "Ask AI" dialog.

#### Basic Usage

```html
<robos-ai-textarea id="prompt" placeholder="Describe your task…"></robos-ai-textarea>

<script>
  const el = document.getElementById('prompt');

  // User pressed Ctrl+Enter or clicked Submit
  el.addEventListener('robos-submit', e => {
    const userText = e.detail.value;
    // call Copilot, then stream back chunks:
    el.streamChunk('Starting analysis…\n');
    el.streamChunk('Found 3 issues.\n');
    el.streamDone();
  });

  // User selected a slash command (e.g. /fix)
  el.addEventListener('robos-command', e => {
    console.log(e.detail.command, e.detail.args);
  });
</script>
```

#### HTML Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `placeholder` | string | `"Type your message… (/ for commands, @ for files)"` | Placeholder text |
| `min-height` | number (px) | `80` | Minimum height of the input area |
| `max-chars` | number | `0` (unlimited) | Character limit; shows counter when set |
| `show-submit` | boolean | `true` | Show the Submit button |
| `show-commands` | boolean | `true` | Enable slash command palette |
| `journal-source` | string | `document.title` | Label written to the Work Journal on AI calls |

#### Methods

| Method | Description |
|---|---|
| `streamChunk(text)` | Append a text chunk to the streaming output area |
| `streamDone()` | End the streaming state (resets UI to idle) |
| `setValue(text)` | Programmatically set the input text |
| `getValue()` | Return the current input text |
| `clear()` | Clear input and streaming output |
| `addContextChip(key, label)` | Add a context chip (shown above input) |
| `removeContextChip(key)` | Remove a context chip by key |

#### Events

| Event | `detail` | Fired when |
|---|---|---|
| `robos-submit` | `{ value: string }` | User submits (Ctrl+Enter or Submit button) |
| `robos-command` | `{ command: string, args: string }` | User selects a slash command |
| `robos-command-selected` | `{ command: string }` | Slash command palette item clicked |
| `robos-path-query` | `{ query: string }` | User types `@` + text (for file autocomplete) |
| `robos-mention-selected` | `{ item: object }` | User selects an `@`-mention item |

#### Default Slash Commands

| Command | Icon | Description |
|---|---|---|
| `/generate` | ✦ | Generate code or content from description |
| `/refine` | 🔄 | Refine or improve existing content |
| `/fix` | 🔧 | Fix a bug or problem |
| `/explain` | 💡 | Explain code or a concept |
| `/summarize` | 📋 | Summarize long content |
| `/test` | 🧪 | Generate tests for code |
| `/review` | 👁 | Review code for issues |
| `/document` | 📝 | Add documentation or comments |
| `/optimize` | ⚡ | Optimize performance |
| `/translate` | 🌐 | Translate between languages or formats |

Custom commands can be registered by setting `el._commands = [...]` before the component connects.

#### `@`-Mention File Picker

Typing `@` opens a file search popup. The component dispatches `robos-path-query` with the typed filter. The host app listens and calls back with:

```js
el.setMentionResults([
  { label: 'src/auth.js', value: 'src/auth.js', icon: '📄' },
]);
```

#### Streaming Display

While streaming, the component shows a green pulsing border and a `⬤ Thinking…` badge. Output is rendered in a read-only monospace area below the input. Call `streamDone()` to reset.

---

## Apps Using robos-ui

| App | How used |
|---|---|
| `git-projects` | AI prompt bar for dev-setup script generation |
| `tech-workbench` | Main AI workbench prompt and response area |
| `file-explorer` | AI file-operation prompt |

---

## Source

```
packages/robos-ui/robos-ui.js
```

No `node_modules`, no build step. Edit the single file and redeploy.
