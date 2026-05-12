---
title: AI Shell — Prompt Your OS
layout: default
nav_order: 6
---

# AI Shell — Prompt Your OS
{: .no_toc }

Talk to your operating system in plain English. RobOS ships two tightly-integrated apps — **AI Prompt** and **Skills Manager** — that together turn natural language into shell commands, run them with a real AI agent, and return structured step-by-step results.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

Traditional shells require memorizing dozens of command-line tools, flags, and syntax. RobOS AI Shell flips that model:

1. **Browse pre-built skills** in the sidebar (or search by name)
2. **Fill in any required parameters** (filenames, ports, patterns) — they appear as inline input fields
3. **Type an optional prompt** or skip it entirely if the skills say it all
4. **Pick your AI agent** (Claude, Copilot, Codex, Gemini) via the header pill
5. **Hit Run** — the AI executes the commands and returns a structured report: each step has the command, its raw output, and a plain-English explanation

Every run is stored in history so you can replay or reference past operations.

---

## RobOS AI Prompt

### What it does

AI Prompt is a conversational shell. It bridges natural language and the Linux command line by:

- Letting you describe what you want in plain English
- Attaching pre-built shell "skills" (commands) to guide the AI
- Running everything through a real AI agent that handles execution and explanation
- Returning a numbered step report with commands, output, and notes

### User Interface

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 RobOS AI Prompt          [Agent: ⊕ Copilot ▾]  [History]   │
├───────────────┬─────────────────────────────────────────────────┤
│ Skills        │                                                 │
│ ┌ Search ──┐  │  Selected skills:                              │
│ │           │  │  ┌────────────────┐  ┌────────────────────┐   │
│ File Ops    │  │  │ disk-usage  ✕ │  │ grep-recursive  ✕ │   │
│  disk-usage │  │  └────────────────┘  │ PATTERN: [______] │   │
│  find-large │  │                      └────────────────────┘   │
│  json-pretty│  │  ┌─────────────────────────────────────────┐  │
│ Git         │  │  │ What do you want to do?                  │  │
│  git-status │  │  │                                          │  │
│  git-log    │  │  └─────────────────────────────────────────┘  │
│  git-stash  │  │                                                 │
│ Process     │  │  [▶ Run with AI]  [Clear]                     │
│  list-procs │  │  Select a skill or enter a prompt              │
│  kill-port  │  │                                                 │
│  top-cpu    │  ├─────────────────────────────────────────────────┤
│  ...        │  │ ✅ Results                                      │
│             │  │  Step 1: df -h --output=size,used,avail,pcent  │
│             │  │  [output]  Home directory is 43% full (23 GB)  │
└─────────────┴─────────────────────────────────────────────────────┘
```

### Skill selection and parameter inputs

When you click a skill in the sidebar it gets added to the **selected skills** area above the prompt box. Skills that contain `$VARIABLE` placeholders automatically expand into an input card:

```
┌──────────────────────────────┐
│  grep-recursive          ✕  │
│  PATTERN: [____________]     │
└──────────────────────────────┘
```

The parameter value is substituted directly into the command before it reaches the AI. If you leave a parameter blank, the raw `$PATTERN` token is passed through — the AI will attempt to infer it from your prompt.

### Skills-only mode

You don't need to type a prompt. If you've selected at least one skill, the Run button is enabled immediately. The AI receives the auto-prompt:

> *"Run the selected skills and show me the results."*

Combine multiple skills — for example `git-status` + `disk-usage` + `list-processes` — for a quick system health report with a single click.

### AI agent selection

The agent pill in the header lets you switch AI provider mid-session:

| Provider | Command used |
|:---------|:-------------|
| **GitHub Copilot** | `gh copilot suggest -t shell` |
| **Claude** | `claude -p` |
| **Codex** | `codex` |
| **Gemini** | `gemini` |

Auth status is checked when the app loads. If a provider isn't authenticated, a banner appears with a login link.

### Structured results format

Every run returns a JSON structure with:

```json
{
  "summary": "Checked disk usage and found 3 large log files",
  "status": "success",
  "steps": [
    {
      "step": 1,
      "action": "Check disk usage",
      "command": "df -h ~",
      "output": "Filesystem  Size  Used  Avail  Use%\n/dev/sda1  100G   43G   57G   43%",
      "note": "Home directory is 43% full with 57 GB remaining."
    }
  ]
}
```

The renderer displays each step as a card: command in a monospace code block, output collapsible, note in plain prose.

### Run history

Every prompt+result pair is stored in `~/.config/robos/ai-prompt-history.json`. The history panel (top right) lists past runs newest-first. Click any entry to restore the prompt text and view the original results.

---

## Skills Manager

### What it does

Skills Manager is the library catalog for AI Prompt. It lets you:

- Browse all built-in skills grouped by category
- Search by name, description, or category
- Create custom skills with your own shell commands and `$PARAM` definitions
- Import community skill packs from GitHub repositories

### Built-in skill library (74 skills)

#### File Operations
| Skill | Command | Params |
|:------|:--------|:-------|
| `disk-usage` | `df -h --output=source,size,used,avail,pcent` | — |
| `find-large-files` | `find ~ -type f -size +100M 2>/dev/null \| head -20` | — |
| `list-directory` | `ls -la` | — |
| `json-pretty` | `cat $FILE \| jq .` | `$FILE` |
| `csv-summary` | `head -5 $FILE && wc -l $FILE` | `$FILE` |
| `count-lines` | `wc -l $FILE` | `$FILE` |
| `file-permissions` | `ls -la $FILE` | `$FILE` |
| `find-by-extension` | `find . -name "*.js" \| head -30` | — |

#### Process Management
| Skill | Command | Params |
|:------|:--------|:-------|
| `list-processes` | `ps aux --sort=-%cpu \| head -20` | — |
| `kill-port` | `fuser -k $PORT/tcp 2>/dev/null \|\| lsof -ti:$PORT \| xargs kill -9 2>/dev/null` | `$PORT` |
| `top-cpu` | `ps aux --sort=-%cpu \| head -10` | — |
| `top-memory` | `ps aux --sort=-%mem \| head -10` | — |
| `port-in-use` | `ss -tlnp \| grep "$PORT"` | `$PORT` |
| `zombie-processes` | `ps aux \| awk '$8 == "Z"'` | — |

#### Git
| Skill | Command | Params |
|:------|:--------|:-------|
| `git-status` | `git status && git log --oneline -10` | — |
| `git-log` | `git log --oneline --graph --decorate -20` | — |
| `git-branches` | `git branch -a` | — |
| `git-stash` | `git stash list` | — |
| `git-cleanup` | `git branch --merged \| grep -v '\*\|main\|master' \| xargs git branch -d` | — |
| `git-remotes` | `git remote -v` | — |
| `git-diff` | `git diff --stat HEAD` | — |
| `uncommitted` | `git status --short` | — |

#### Network, Docker, System, Package Management, Text Processing, Security, Development

_(See Skills Manager app for the full list — all 74 skills are browsable and searchable in the sidebar)_

### Custom skills

Create a custom skill via the **New Skill** button. Fields:

| Field | Description |
|:------|:------------|
| **ID** | Unique slug (e.g. `deploy-app`) |
| **Name** | Display name in the sidebar |
| **Category** | Groups the skill in the sidebar |
| **Description** | One-line tooltip |
| **Command** | Shell command. Use `$VAR` for parameters. |

Custom skills are saved to `~/.config/robos/skills.json` and immediately available in AI Prompt.

### Community skill packs

The Skills Manager can install skill packs from any GitHub repository that exports a JSON array of skill objects.

**How to add a pack:**

1. Click **Add Pack** in the sidebar footer
2. Paste the GitHub repository URL (e.g. `https://github.com/example/shell-skills`)
3. The app clones the repo to `~/.config/robos/skill-packs/<repo-name>/`
4. Available skills are previewed — check which ones to install
5. Click **Install Selected** — they're merged into `~/.config/robos/skills.json`

**Required skill pack format** — the repo must contain a `skills.json` at its root:

```json
[
  {
    "id": "my-skill",
    "name": "My Skill",
    "description": "Does something useful",
    "category": "Custom",
    "command": "echo hello $NAME",
    "params": ["NAME"]
  }
]
```

---

## Architecture

```
packages/
├── skills-manager/
│   ├── main.js           ← Electron main; IPC handlers
│   ├── skills-data.js    ← Shared BUILTIN_SKILLS array (74 skills)
│   └── renderer/
│       ├── index.html
│       ├── app.js
│       └── style.css
│
└── ai-prompt/
    ├── main.js           ← loads skills-data.js + ~/.config/robos/skills.json
    ├── preload.js
    └── renderer/
        ├── index.html
        ├── app.js        ← extractParams(), substituteParams(), renderSkillChips()
        └── style.css
```

**Shared data flow:**

```
skills-manager/skills-data.js
          │
          ├── required by skills-manager/main.js  (sm-list-skills IPC)
          └── required by ai-prompt/main.js        (ap-list-skills IPC)
                                  │
                    ~/.config/robos/skills.json  (custom/community)
                                  │
                        merged → renderer sidebar
```

`skills-data.js` is the single source of truth for built-in skills. To add a built-in skill, add one entry to that file — both Skills Manager and AI Prompt will automatically pick it up on next launch.

---

## IPC Reference

### AI Prompt (`ai-prompt/main.js`)

| Channel | Input | Returns |
|:--------|:------|:--------|
| `ap-list-skills` | — | `{ builtin: Skill[], custom: Skill[] }` |
| `ap-run-prompt` | `{ prompt, skills, agent }` | `{ ok, summary, steps[], error? }` |
| `ap-list-history` | — | `HistoryEntry[]` |
| `ap-save-history` | `HistoryEntry` | `{ ok }` |
| `robos-check-agent-auth` | `{ agent }` | `{ ok, authenticated }` |

### Skills Manager (`skills-manager/main.js`)

| Channel | Input | Returns |
|:--------|:------|:--------|
| `sm-list-skills` | — | `{ builtin: Skill[], custom: Skill[] }` |
| `sm-save-skill` | `Skill` | `{ ok }` |
| `sm-delete-skill` | `{ id }` | `{ ok }` |
| `sm-import-pack` | `{ url }` | `{ ok, skills: Skill[], error? }` |
| `sm-install-pack-skills` | `{ skills: Skill[] }` | `{ ok, count }` |

### Skill object schema

```typescript
interface Skill {
  id: string;          // unique slug, e.g. "disk-usage"
  name: string;        // display name, e.g. "Disk Usage"
  description: string; // one-liner for tooltip/search
  category: string;    // sidebar grouping
  command: string;     // shell command, may contain $VAR tokens
  builtin?: boolean;   // true for skills-data.js entries
}
```
