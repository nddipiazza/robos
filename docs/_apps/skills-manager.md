---
title: "Skills Manager"
package: skills-manager
category: ai-agents
icon: skills-manager.svg
summary: "Catalog of command snippets and prompt templates for RobOS apps, with custom entries and installable packs from GitHub."
description: "Stores built-in and custom skills in ~/.config/robos/skills.json and can import prompt patterns from Fabric, Awesome Cursor Rules and a bundled SDLC set. These are RobOS catalog entries, not agent skill files."
related:
  - /robos-skills.html
---

In this app a "skill" is an entry with a name, category, tags and either a shell command (for example `node packages/robos-graph/bin/kgraph-cli.js search "$QUERY"`) or a system prompt. The catalog feeds RobOS apps such as AI Prompt. It is separate from the `SKILL.md` agent skills that Claude Code and similar tools load; for those, see [Skills]({{ site.baseurl }}{% link robos-skills.md %}).

## Use it

- **My Skills** lists the built-in skills and your own, with a search box (name, description or tag) and category filter. The built-ins are command snippets in categories such as Knowledge Graph, File Operations, Process Management, Git, Network, Docker, System, Package Management, Text Processing, Security and Development, defined in `packages/skills-manager/skills-data.js`.
- **+ New Skill** opens a form: Name, Category, Description, Command / Script and Tags (comma-separated). Custom skills are saved in `~/.config/robos/skills.json`; built-ins are not stored there.
- **Open AI Prompt** launches the AI Prompt app from `/usr/local/share/robos/ai-prompt`.
- **Skill Packs** lists three featured packs. Select one to browse its patterns, filter them, tick the ones you want, and use **Install Selected** or **Install All**. Installed patterns become custom skills with the pack's system prompt as their content.

| Pack | Source | Needs |
|---|---|---|
| Fabric Patterns | `github.com/danielmiessler/fabric` (`data/patterns`) | Network access, and `git` if you click **Clone Repo** (a shallow clone to `~/.config/robos/skill-packs/fabric`) |
| Awesome Cursor Rules | `github.com/PatrickJS/awesome-cursorrules` (`rules`) | Network access, and `git` to clone |
| SDLC Essentials | Built into the app (code review, PR writing, testing, documentation and similar prompts) | Nothing |

Browsing the two GitHub packs uses the GitHub contents API unless the repository is already cloned. The pack descriptions in the app quote pattern counts and star counts that are written into the source, not fetched, so they may be out of date.

Imported entries are named with a category prefix (`Fabric:`, `CursorRules:` or `SDLC:`). An entry that is already installed is skipped.
