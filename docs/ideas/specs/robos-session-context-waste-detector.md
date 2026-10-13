---
title: "Proposal: session context inspector"
layout: default
nav_exclude: true
---

# Proposal: session context inspector
{: .no_toc }

Show what fills the context of a long agent session, which tool calls were the largest, and what could be trimmed.
{: .fs-6 }

{: .important }
Proposal, not built. No session size or waste analysis exists in the repository.

## Proposal

A view attached to each session in [Agents Manager]({{ '/apps/agents-manager/' | relative_url }}), with these parts:

- **Composition.** Split the session into tool output, repeated file reads, content never referenced again, reasoning, system prompt and tool schemas, and the useful working set. Show total size, estimated tokens and a waste ratio.
- **Largest calls.** A ranked list of tool calls and commands by output size, with a preview.
- **Growth.** Context size by turn, so a sudden jump (a minified bundle, a directory dump) is visible.
- **Repetition.** Group identical reads, polling commands and directory listings.
- **Stale content.** Flag content loaded early and not referenced since.
- **Trimming.** Suggested rules (truncate long tool output, replace duplicate reads with a reference, summarize old turns), a dry run that compares sizes, an export of the pruned transcript, and a way to resume from it.
- **Audit record.** A `robos:SessionContextWasteAudit` node written to `.robos/audits/`, linked to the session.

The spec names Claude Code, GitHub Copilot CLI, OpenAI Codex, Google Antigravity and RobOS's own agent sessions as sources.

## What exists today

- Agents Manager already lists past sessions of Claude Code, GitHub Copilot and Codex (`packages/agents-manager/main.js`, `codex-sessions.js`). It does not measure what is in them.
- Nothing in `packages` or `.robos` defines `robos:SessionContextWasteAudit`.

## Source

Raw note: [`ideas/inbox/robos-session-context-waste-detector.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/robos-session-context-waste-detector.txt). The earlier long spec is in the git history of this file.
