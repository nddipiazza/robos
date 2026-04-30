---
title: "12 — P4 — MCP HTTP integration"
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 12
---

# Video 12 — P4 — MCP HTTP integration
{: .no_toc }

**Protagonist:** Alex
**Arc:** Engineering
**Target length:** 5:00
**Apps in frame:** AI Agent Manager · Context Manager · CI Monitor · Notifications

## Unique to this episode

The UI starts talking to a real backend. Scene highlight: flipping between local-only mode (no `mcpBaseURL`) and MCP mode (with URL), watching the mutation round-trip via HTTP. Narration covers the amber error banner + fallback. Optionally include a forced failure to show the retry flow.

## The real engineering work

`src/JsonnetEditor/mcpClient.ts` wraps local callbacks in HTTP POSTs to the MCP server. New prop `mcpBaseURL` on JsonnetEditor. Error banner with retry + local-fallback. Tested against a mock MCP server running on the VM.

## Scene list (abbreviated — hero episode shows the full flow)

1. **Pickup** — Alex filters Task Board to the next story, moves to `in_progress`.
2. **AI session** — Claude drafts the implementation using the canned fixture for this story. Focus the camera on *the specific thing this phase is about* (see "Unique" above).
3. **Review** — Jordan's PR Review Board shows the diff, Jordan approves (or requests a targeted change unique to this phase).
4. **Merge + ship** — CI green, package published, Deploy Tracker updates. Quick cut.
5. **Close** — narration underlines what shipped and why it matters for the next episode.

## Blockers / ready-checklist

- [ ] Canned Claude diff for this story under `packages/robos-test/sandbox/data/model-problem/p4-mcp-integration/`.
- [ ] Any phase-specific fixture (e.g. proto descriptors from Video 05) must be in place — don't start recording until the previous episode's artifacts are real.
- [ ] Narration script: draft ~6 cues specific to this phase's story.

## Deliverables produced by this video

- Story merged on `acme-corp/buildbarn-forms`.
- Feature visible in the e2e app when run from a clean clone.
