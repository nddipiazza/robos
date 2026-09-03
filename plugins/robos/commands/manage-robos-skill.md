# Manage RobOS AI Skills

Add, update, or remove an AI agent skill in the RobOS plugin marketplace and synchronize across all agent platforms (Claude Code, OpenAI Codex, Antigravity, GitHub Copilot, Gemini CLI).

## Input

$ARGUMENTS — One of:
- `add <skill-name> "<description>"`
- `update <skill-name>`
- `remove <skill-name>`
- `list`

## Procedure

Follow the instructions in `plugins/robos/skills/manage-robos-skill/SKILL.md`:
1. For `add`: create `plugins/robos/skills/<skill-name>/SKILL.md` and `plugins/robos/commands/<skill-name>.md`, register in `plugins/robos/plugin.json`, and run `./plugins/install.sh --sync`.
2. For `update`: edit the skill files and run `./plugins/install.sh --sync`.
3. For `remove`: delete the skill files, deregister from `plugins/robos/plugin.json`, and clean up synced agent files.
4. For `list`: display all skills from `plugins/robos/plugin.json`.
