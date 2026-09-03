---
name: manage-robos-skill
description: Add, update, or remove a RobOS AI skill in the plugin marketplace and sync across agent platforms (Claude, Codex, Antigravity, Copilot, Gemini).
---

# Manage RobOS Skill

Manage AI agent skills within the RobOS plugin marketplace. Use this skill whenever you need to create a new skill, update an existing skill, or remove a deprecated skill from the RobOS toolchain.

## Input

`$ARGUMENTS` — Subcommand and arguments:
- `add <skill-name> "<description>"` — Scaffold and register a new skill
- `update <skill-name>` — Guide editing and updating an existing skill
- `remove <skill-name>` — Safely delete and deregister a skill
- `list` — List all registered skills in the RobOS plugin marketplace

---

## Procedures

### 1. Adding a New Skill

When adding a new skill:

1. **Verify naming convention**:
   - Must be lowercase kebab-case (e.g., `inspect-metrics`, `deploy-service`).

2. **Create Skill Directory & `SKILL.md`**:
   Create `plugins/robos/skills/<skill-name>/SKILL.md`:
   ```markdown
   ---
   name: <skill-name>
   description: <Concise, actionable description of what this skill does and when to use it.>
   ---

   # <Skill Title>

   <Overview of the skill>

   ## Input
   $ARGUMENTS — <parameters or payload>

   ## Procedure
   1. <Step 1>
   2. <Step 2>

   ## Validation
   - <Verification checklist>
   ```

3. **Create Command Definition**:
   Create `plugins/robos/commands/<skill-name>.md`:
   ```markdown
   # <Skill Title>

   <Command documentation and invocation steps>
   ```

4. **Register in Plugin Manifest**:
   Add `<skill-name>` to both `"skills"` and `"commands"` arrays in `plugins/robos/plugin.json`.

5. **Sync to Agent Platforms**:
   Run the sync command:
   ```bash
   ./plugins/install.sh --sync
   ```

6. **Update Documentation**:
   - Add the skill to the catalog in `plugins/README.md`.
   - Add the skill to the skills summary in `AGENTS.md`.

---

### 2. Updating an Existing Skill

When updating a skill:

1. Edit `plugins/robos/skills/<skill-name>/SKILL.md`.
2. Edit `plugins/robos/commands/<skill-name>.md` if command flags or syntax changed.
3. Run `./plugins/install.sh --sync` to propagate changes across `.agents/skills/`, `.claude/commands/`, `.gemini/commands/`, and `.antigravity/commands/`.
4. Update `plugins/README.md` if the description or usage changed.

---

### 3. Removing a Skill

When removing a skill:

1. Delete directory `plugins/robos/skills/<skill-name>/`.
2. Delete file `plugins/robos/commands/<skill-name>.md`.
3. Remove `<skill-name>` from `plugins/robos/plugin.json` (`skills` and `"commands"`).
4. Remove target copies from `.agents/skills/<skill-name>/`, `.claude/commands/<skill-name>.md`, `.gemini/commands/<skill-name>.md`, `.antigravity/commands/<skill-name>.md`.
5. Remove entry from `plugins/README.md` and `AGENTS.md`.

---

## Validation

- Ensure `SKILL.md` contains valid YAML frontmatter with `name` and `description`.
- Ensure JSON manifests (`plugin.json`, `marketplace.json`) are valid JSON.
- Run `./plugins/install.sh --dry-run` or `./plugins/install.sh --sync` to verify clean synchronization.
