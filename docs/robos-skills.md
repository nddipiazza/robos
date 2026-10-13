---
title: Skills
layout: default
parent: Build on RobOS
nav_order: 6
has_children: true
permalink: /robos-skills.html
---

# Skills
{: .no_toc }

A skill is a folder of instructions that a coding agent follows to do one RobOS task, such as starting the VM or importing a knowledge graph. This page explains where skills live, how to run one, and how to add your own.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What a skill is

A RobOS agent skill is a directory under `plugins/robos/skills/` that contains a `SKILL.md` file. The file starts with YAML front matter and continues with plain Markdown instructions that the agent reads and follows. A skill is not compiled code. A few skills ship a helper script in a `scripts/` folder (`import-company-kgraph`, `install-desktop-app`, `schema-lookup`), and the instructions tell the agent when to run it.

The front matter has two keys in every existing skill. `name` matches the directory name and uses lowercase kebab-case. `description` is one sentence that tells an agent when the skill applies.

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

This is the template from the `manage-robos-skill` skill. The body is free-form. Most skills use some of the headings `Input`, `When to Use`, `Steps` or `Procedure`, `Execution` and `Validation`. In the `Input` section, `$ARGUMENTS` stands for whatever you type after the skill name.

## Two kinds of skill

| | Agent skills | Skills Manager shell skills |
| --- | --- | --- |
| What it is | A `SKILL.md` with instructions for an agent | A named shell command with a description and tags |
| Where it lives | `plugins/robos/skills/<name>/SKILL.md` | `packages/skills-manager/skills-data.js` for built-in ones, `~/.config/robos/skills.json` for your own |
| Who runs it | A coding agent, usually through a slash command | You, by copying the command from the Skills Manager window |
| Reference | [Skills catalog]({{ site.baseurl }}{% link skills/skills-catalog.md %}) | [Skills Manager Desktop App]({{ site.baseurl }}{% link skills/skills-manager.md %}) |

`packages/robos-lib/skill-catalog.js` merges both kinds, plus the installed `SKILL.md` files, into one list. PR Review uses it to feed the `/skills` picker in the `<robos-ai-textarea>` prompt box. The picker is described on the Skills Manager page.

## Where skills live

`plugins/robos/skills/` is the source. Other agent directories hold copies that `plugins/install.sh` generates, so edit the source and re-run the installer.

| Path | Contents |
| --- | --- |
| `plugins/robos/skills/<name>/SKILL.md` | The skill itself |
| `plugins/robos/commands/<name>.md` | The slash-command bridge: a short file that passes `$ARGUMENTS` to the skill |
| `plugins/robos/plugin.json` | Plugin manifest with `skills` and `commands` lists |
| `.agents/skills/`, `.github/skills/` | Copies of the skill folders |
| `.claude/commands/`, `.antigravity/commands/`, `.gemini/commands/` | Copies of the command files |

A command file is only a pointer. `plugins/robos/commands/start-vm.md`, for example, takes the optional flags and says to follow `plugins/robos/skills/start-vm/SKILL.md`.

## Run a skill

If the skill has a command file, type the slash command in your agent with the arguments the skill's `Input` section describes:

```text
/start-vm --headless
/app-snapshot dev-central --json
/create-robos-app "Work Journal"
```

Some skills have no command file, including the `kgraph-*` skills and `pr-review-theater`. Ask the agent for the task in plain words and name the skill, for example "use the kgraph-impact-analysis skill on urn:robos:service:orders-api". The [Skills catalog]({{ site.baseurl }}{% link skills/skills-catalog.md %}) shows which skills have a slash command.

Which agent reads which directory is up to the agent. The table in the next section only lists what the installer writes.

## Install and sync

Run the installer from the repository root. With no options it writes project-level copies for every agent:

```bash
./plugins/install.sh
```

![A skills repository on the left feeds a sync engine running install.sh, which copies skills to Claude Code, OpenAI Codex, Google Antigravity, GitHub Copilot and Gemini CLI]({{ '/assets/images/robos-skills-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

| Option | Effect |
| --- | --- |
| `--target <agent>` | Limit to `claude`, `codex`, `antigravity`, `copilot` or `gemini` (default `all`) |
| `--skill <name>` | Sync one skill and its command file; project level only |
| `--global` | Install to your home directory instead of the repository |
| `--dry-run` | Print what would be copied |
| `--sync` | Accepted, but project-level sync is the default behavior |

Project-level targets write to these places:

| Target | Writes |
| --- | --- |
| `claude` | `.agents/skills/`, `.claude/commands/` |
| `codex` | `.agents/skills/` |
| `antigravity` | `.agents/skills/`, `.antigravity/commands/` |
| `copilot` | `.github/skills/` |
| `gemini` | `.gemini/commands/` |

With `--global`, the installer writes `~/.agents/skills/`, `~/.claude/plugins/marketplaces/robos/` and `~/.antigravity/skills/`. It does not write global Copilot or Gemini files.

## Add a skill

The `manage-robos-skill` skill does these steps for you. Run `/manage-robos-skill add <skill-name> "<description>"`, or do them by hand:

1. Create `plugins/robos/skills/<skill-name>/SKILL.md` with the front matter above. The name must be lowercase kebab-case.
2. Create `plugins/robos/commands/<skill-name>.md` if you want a slash command.
3. Add the name to the `skills` and `commands` arrays in `plugins/robos/plugin.json`.
4. Run `./plugins/install.sh --skill <skill-name>`.
5. Add the skill to the list in `AGENTS.md` and to `plugins/README.md`.

`manage-robos-skill` also supports `update`, `remove` and `list`.

{: .note }
`install.sh` copies every directory under `plugins/robos/skills/`, whether or not `plugin.json` lists it. The manifest is not complete today: several skills, including the `kgraph-*` skills, are not in its `skills` list, and it lists a `sync-kgraph-docs` command that has no command file.

## Not built yet

The Skill Commons whitepaper proposes a shared catalog of verified, compiled skills that a small local model could assemble. That catalog, the compiler and the assembler do not exist. The proposal is at [rowbose.com/future](https://rowbose.com/future/).

## Related pages

- [Skills catalog]({{ site.baseurl }}{% link skills/skills-catalog.md %}): every skill in `plugins/robos/skills/`, with its purpose and how to invoke it.
- [Skills Manager Desktop App]({{ site.baseurl }}{% link skills/skills-manager.md %}): the shell-command library and skill packs.
- [Import company knowledge graph]({{ site.baseurl }}{% link skills/import-company-kgraph.md %}): the `import-company-kgraph` skill in detail.
- [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}): the graph that the `kgraph-*` skills read and change.
