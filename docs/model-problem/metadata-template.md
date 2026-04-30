---
title: YouTube Metadata Template
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 3
---

# YouTube Metadata Template
{: .no_toc }

Copy this verbatim into `<output-dir>/youtube.md` for each Model Problem episode and fill the `<<...>>` placeholders. Order of the sections matches what the YouTube Studio upload UI asks for.
{: .fs-5 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The template

````markdown
# Model Problem · <<NN>> — <<Title>>

## YouTube title

```
RobOS Model Problem · <<NN>> — <<Title>>
```

## Description

```
<<One-paragraph hook. Describe the protagonist, the apps, the outcome of the episode in 2-3 sentences. The first 125 chars show in search, so front-load.>>

<<Second paragraph: what the viewer takes away. The "why this matters" beat. 3-4 sentences.>>

Chapters
0:00 <<Section 1 name>>
<<MM:SS>> <<Section 2 name>>
<<MM:SS>> <<Section 3 name>>
<<MM:SS>> <<Section 4 name>>
<<MM:SS>> <<Section 5 name>>
<<MM:SS>> Wrap

This is episode <<NN>> of the RobOS Model Problem series — four people, one fresh RobOS install, one shipped React library. <<Link to the prior episode if any.>>

Links
Series playlist: https://www.youtube.com/playlist?list=<<PLAYLIST_ID>>
Docs & getting started: https://nddipiazza.github.io/robos/
GitHub repo: https://github.com/nddipiazza/robos
buildbarn-forms: https://github.com/nddipiazza/buildbarn-forms

RobOS is the AI-native operating system for software teams — a purpose-built Linux desktop where AI does the heavy lifting and the entire OS reshapes itself from a prompt. Pre-1.0 and building in public.

#RobOS #ModelProblem #BuildbarnForms #<<PhaseSpecificTag>>
```

## Tags

```
robos, model problem, buildbarn-forms, react, typescript, AI agent, claude code, github copilot, dev tools, developer productivity, electron, linux, AI operating system, open source, <<phase-specific tag>>
```

## Upload Settings

- **Visibility:** Unlisted for review → Public after watch-through
- **Category:** Science & Technology
- **Language:** English
- **Captions:** Upload `captions.vtt` as the English caption track
- **Playlist:** RobOS Model Problem
- **End screen:** Subscribe + link to <<previous episode title>> + link to <<next episode title or master cut>>
- **Pinned position (only for episodes 01, 05, 16):** Channel homepage "Featured video"

## Files in This Folder

| File | Purpose |
|:-----|:--------|
| `narrated.mp4` | Main video (h264 + aac + mov_text captions) — upload this |
| `raw.webm` / `trimmed.mp4` | Source capture (silent + edited) |
| `captions.vtt` | Captions sidecar (also upload separately) |
| `cues.json` | Narration cue list — input to the narrator pipeline |
| `youtube.md` | This file |

## Cue list (regenerate chapters from this)

| # | Time | Narration |
|:-:|:----:|:----------|
| 1 | 0:00 | <<cue text>> |
| 2 | <<MM:SS>> | <<cue text>> |
| ... | | |
````

---

## How to fill it

### Title

The per-video doc (`videos/NN-*.md`) has an explicit episode title. Use it verbatim, with `RobOS Model Problem · NN — ` prepended. Example for video 01:

```
RobOS Model Problem · 01 — Dana Sets Up RobOS for Acme
```

Title cap is 100 chars. Don't get cute — readers see this in search, on the watch page, and in the playlist sidebar.

### Description hook

Two paragraphs. The first answers *what is this episode about?* in plain language; the second answers *why does it matter?*. Avoid jargon in paragraph 1; you can dig in by paragraph 2.

### Chapters

YouTube auto-detects chapter timestamps in the description **only if** the first one is `0:00` and there are at least three. Pull them from `cues.json` — typically each cue's start time becomes a chapter, with an editorial label (the cue's narration is too long for a chapter title).

Chapter titles should be 4–8 words. No punctuation other than em-dash.

### Tags

The static tags in the template apply to every episode. Append one phase-specific tag — e.g. `proto descriptors` for video 09, `MCP` for video 12, `storybook` for video 16.

### End screen

Always: Subscribe button + previous episode + next episode (or master cut for the final episodes).

For the master cut (video 20), the end screen should link to the **most-watched** prior episode, not the first one.

---

## Generator script

If you find yourself filling this manually for the third or fourth time, automate. The bare-minimum generator:

```bash
#!/usr/bin/env bash
# docs/model-problem/scripts/gen-metadata.sh
set -e
NUM="$1"   # e.g. "01"
SLUG="$2"  # e.g. "dana-setup"
TITLE="$3" # e.g. "Dana Sets Up RobOS for Acme"

OUT_DIR="packages/robos-test/run/demos/model-problem/${NUM}-${SLUG}"
[ -f "$OUT_DIR/cues.json" ] || { echo "ERROR: $OUT_DIR/cues.json missing — run narrator first"; exit 1; }

# Generate chapter list from cues.json (cue startMs → MM:SS, label from "label" field)
CHAPTERS=$(jq -r '.[] | "\((.startMs/60000 | floor)):\(((.startMs/1000) % 60) | floor | tostring | (if length==1 then "0"+. else . end)) \(.label)"' "$OUT_DIR/cues.json")

cat > "$OUT_DIR/youtube.md" <<EOF
# Model Problem · ${NUM} — ${TITLE}

## YouTube title

\`\`\`
RobOS Model Problem · ${NUM} — ${TITLE}
\`\`\`

## Description

\`\`\`
TODO: hook paragraph

TODO: takeaway paragraph

Chapters
${CHAPTERS}

This is episode ${NUM} of the RobOS Model Problem series.

Links
GitHub repo: https://github.com/nddipiazza/robos
buildbarn-forms: https://github.com/nddipiazza/buildbarn-forms

#RobOS #ModelProblem #BuildbarnForms
\`\`\`

[...rest...]
EOF
echo "Wrote $OUT_DIR/youtube.md — fill in the TODOs"
```

Add a `label` field to each entry of `cues.json` (a short editorial chapter label, distinct from the cue's narration) and the generator does most of the work.

---

## QA checklist before publishing

- [ ] Title under 100 chars
- [ ] First chapter is `0:00`
- [ ] At least 3 chapters
- [ ] Chapter titles 4–8 words, no random punctuation
- [ ] Description first 125 chars front-load the value
- [ ] Tags include both the universal set + 1 phase-specific
- [ ] Captions upload separately (don't trust the auto-generated)
- [ ] Visibility starts at Unlisted; flip to Public after a watch-through
- [ ] Playlist: `RobOS Model Problem`
- [ ] End screen wired to previous + next + Subscribe
- [ ] Hashtags at end of description (max 3 visible above title)
